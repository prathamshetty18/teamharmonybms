// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILandRegistry {
    enum ClaimStatus {
        Pending,   // 0
        Verified,  // 1
        Disputed   // 2
    }

    function statusOf(uint256 claimId) external view returns (ClaimStatus);
    function claimantOf(uint256 claimId) external view returns (address);
}

/**
 * @title ReliefFund
 * @notice Disaster relief escrow with dual-officer signoff, budget commitment tracking, and reentrancy protection.
 * @dev All payouts are bound strictly to the claimant address registered in LandRegistry.
 */
contract ReliefFund {
    enum PayoutStatus {
        None,      // 0
        Assessed,  // 1
        Approved,  // 2
        Paid       // 3
    }

    struct ReliefEvent {
        bytes32 zoneHash;          // sha256 of affected disaster zone GeoJSON
        uint256 budget;            // Total funds deposited
        uint256 committed;         // Approved-but-unpaid allocations
        uint256 paid;              // Already released payments
        uint256 maxPerClaim;       // Maximum compensation ceiling per claim
        uint64 expiresAt;          // Timestamp after which unallocated budget can be swept
        bool active;
    }

    struct Payout {
        PayoutStatus status;
        uint8 damageLevel;             // 1 to 4
        bytes32 damageEvidenceHash;    // Assessment photo/data hash
        uint256 amount;
        address payable beneficiary;
        address officer1;
        address officer2;
        uint256 releasedAt;
    }

    ILandRegistry public immutable landRegistry;
    address public admin;
    uint256 public totalReliefEvents;

    // reliefId => ReliefEvent
    mapping(uint256 => ReliefEvent) public reliefEvents;

    // reliefId => claimId => Payout
    mapping(uint256 => mapping(uint256 => Payout)) public payouts;

    mapping(address => bool) public isOfficer;
    mapping(address => bool) public isAssessor;

    // Reentrancy guard state
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _reentrancyStatus;

    event ReliefCreated(
        uint256 indexed reliefId,
        bytes32 indexed zoneHash,
        uint256 budget,
        uint256 maxPerClaim,
        uint64 expiresAt
    );
    event ReliefFunded(uint256 indexed reliefId, uint256 addedAmount, uint256 newTotalBudget);
    event OfficerStatusUpdated(address indexed officer, bool allowed);
    event AssessorStatusUpdated(address indexed assessor, bool allowed);
    event ClaimAssessed(uint256 indexed claimId, uint256 indexed reliefId, uint8 damageLevel, bytes32 evidenceHash);
    event PayoutApproved(uint256 indexed claimId, uint256 indexed reliefId, uint256 amount, address beneficiary, address officer);
    event ApprovalsReset(uint256 indexed claimId, uint256 indexed reliefId);
    event PayoutReleased(uint256 indexed claimId, uint256 indexed reliefId, uint256 amount, address indexed beneficiary);
    event UnspentFundsSwept(uint256 indexed reliefId, uint256 amount, address indexed recipient);

    modifier onlyAdmin() {
        require(msg.sender == admin, "ReliefFund: Only admin");
        _;
    }

    modifier onlyOfficer() {
        require(isOfficer[msg.sender] || msg.sender == admin, "ReliefFund: Only authorized officer");
        _;
    }

    modifier onlyAssessor() {
        require(isAssessor[msg.sender] || msg.sender == admin, "ReliefFund: Only accredited assessor");
        _;
    }

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReliefFund: Reentrancy detected");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    constructor(address _landRegistryAddress) {
        require(_landRegistryAddress != address(0), "ReliefFund: Invalid LandRegistry address");
        landRegistry = ILandRegistry(_landRegistryAddress);
        admin = msg.sender;
        isOfficer[msg.sender] = true;
        isAssessor[msg.sender] = true;
        _reentrancyStatus = _NOT_ENTERED;
    }

    function _requireVerified(uint256 claimId) internal view {
        ILandRegistry.ClaimStatus status = landRegistry.statusOf(claimId);
        require(status == ILandRegistry.ClaimStatus.Verified, "ReliefFund: Claim is not Verified");
    }

    function setOfficer(address user, bool allowed) external onlyAdmin {
        require(user != address(0), "ReliefFund: Zero address");
        isOfficer[user] = allowed;
        emit OfficerStatusUpdated(user, allowed);
    }

    function setAssessor(address user, bool allowed) external onlyAdmin {
        require(user != address(0), "ReliefFund: Zero address");
        isAssessor[user] = allowed;
        emit AssessorStatusUpdated(user, allowed);
    }

    /**
     * @notice Declare a relief scheme, deposit budget, and establish per-claim cap and expiry
     */
    function createRelief(
        bytes32 zoneHash,
        uint256 maxPerClaim,
        uint64 expiresAt
    ) external payable onlyAdmin returns (uint256 reliefId) {
        require(zoneHash != bytes32(0), "ReliefFund: Invalid zoneHash");
        require(maxPerClaim > 0, "ReliefFund: maxPerClaim must be > 0");
        require(expiresAt > block.timestamp, "ReliefFund: Expiry must be in future");

        totalReliefEvents += 1;
        reliefId = totalReliefEvents;

        reliefEvents[reliefId] = ReliefEvent({
            zoneHash: zoneHash,
            budget: msg.value,
            committed: 0,
            paid: 0,
            maxPerClaim: maxPerClaim,
            expiresAt: expiresAt,
            active: true
        });

        emit ReliefCreated(reliefId, zoneHash, msg.value, maxPerClaim, expiresAt);
    }

    /**
     * @notice Top up an active relief budget
     */
    function fundRelief(uint256 reliefId) external payable {
        require(reliefId > 0 && reliefId <= totalReliefEvents, "ReliefFund: Invalid reliefId");
        ReliefEvent storage eventItem = reliefEvents[reliefId];
        require(eventItem.active, "ReliefFund: Event inactive");

        eventItem.budget += msg.value;
        emit ReliefFunded(reliefId, msg.value, eventItem.budget);
    }

    /**
     * @notice Field assessor records damage level (1-4). Allowed if not yet approved.
     */
    function assess(
        uint256 claimId,
        uint256 reliefId,
        uint8 damageLevel,
        bytes32 damageEvidenceHash
    ) external onlyAssessor {
        require(reliefId > 0 && reliefId <= totalReliefEvents, "ReliefFund: Invalid reliefId");
        require(damageLevel >= 1 && damageLevel <= 4, "ReliefFund: Damage level must be 1 to 4");
        require(damageEvidenceHash != bytes32(0), "ReliefFund: Invalid damageEvidenceHash");

        _requireVerified(claimId);

        Payout storage p = payouts[reliefId][claimId];
        // Allow assessment if status is None OR if Assessed with zero approvals (officer1 == address(0))
        require(
            p.status == PayoutStatus.None ||
            (p.status == PayoutStatus.Assessed && p.officer1 == address(0)),
            "ReliefFund: Assessment locked by officer approval"
        );

        p.status = PayoutStatus.Assessed;
        p.damageLevel = damageLevel;
        p.damageEvidenceHash = damageEvidenceHash;

        emit ClaimAssessed(claimId, reliefId, damageLevel, damageEvidenceHash);
    }

    /**
     * @notice Dual-officer approval ensuring claimant address matches LandRegistry registry
     */
    function approvePayout(
        uint256 claimId,
        uint256 reliefId,
        uint256 amount,
        address payable beneficiary
    ) external onlyOfficer {
        require(reliefId > 0 && reliefId <= totalReliefEvents, "ReliefFund: Invalid reliefId");
        ReliefEvent storage eventItem = reliefEvents[reliefId];
        require(eventItem.active, "ReliefFund: Event inactive");

        // Verify claim is Verified
        _requireVerified(claimId);

        // Claimant binding: beneficiary must match registry's claimant address
        require(beneficiary == landRegistry.claimantOf(claimId), "ReliefFund: Beneficiary must match registered claimant");

        Payout storage p = payouts[reliefId][claimId];
        require(
            p.status == PayoutStatus.Assessed || p.status == PayoutStatus.None,
            "ReliefFund: Invalid payout stage for approval"
        );

        if (p.officer1 == address(0)) {
            // First officer approval: verify budget limits and commit funds
            require(eventItem.committed + eventItem.paid + amount <= eventItem.budget, "ReliefFund: Exceeds relief budget");
            require(amount <= eventItem.maxPerClaim, "ReliefFund: Exceeds maxPerClaim ceiling");

            p.officer1 = msg.sender;
            p.amount = amount;
            p.beneficiary = beneficiary;
            eventItem.committed += amount;

            emit PayoutApproved(claimId, reliefId, amount, beneficiary, msg.sender);
        } else {
            // Second officer approval: must match amount and beneficiary
            require(msg.sender != p.officer1, "ReliefFund: Same officer cannot approve twice");
            require(amount == p.amount, "ReliefFund: Amount mismatch with first approval");
            require(beneficiary == p.beneficiary, "ReliefFund: Beneficiary mismatch with first approval");

            p.officer2 = msg.sender;
            p.status = PayoutStatus.Approved;

            emit PayoutApproved(claimId, reliefId, amount, beneficiary, msg.sender);
        }
    }

    /**
     * @notice Admin resets approvals if officers deadlock on amount, uncommitting funds
     */
    function resetApprovals(uint256 claimId, uint256 reliefId) external onlyAdmin {
        require(reliefId > 0 && reliefId <= totalReliefEvents, "ReliefFund: Invalid reliefId");
        Payout storage p = payouts[reliefId][claimId];
        require(p.status != PayoutStatus.Paid, "ReliefFund: Already paid");

        if (p.officer1 != address(0)) {
            reliefEvents[reliefId].committed -= p.amount;
        }

        p.officer1 = address(0);
        p.officer2 = address(0);
        p.amount = 0;
        p.beneficiary = payable(address(0));
        p.status = (p.damageLevel > 0) ? PayoutStatus.Assessed : PayoutStatus.None;

        emit ApprovalsReset(claimId, reliefId);
    }

    /**
     * @notice Releases approved funds to beneficiary. Re-verifies land claim state at release time.
     */
    function release(uint256 claimId, uint256 reliefId) external nonReentrant {
        require(reliefId > 0 && reliefId <= totalReliefEvents, "ReliefFund: Invalid reliefId");
        ReliefEvent storage eventItem = reliefEvents[reliefId];
        Payout storage p = payouts[reliefId][claimId];

        require(p.status == PayoutStatus.Approved, "ReliefFund: Payout not approved by two officers");

        // Re-check LandRegistry: MUST STILL BE VERIFIED (fails if Disputed or Pending)
        _requireVerified(claimId);

        uint256 payoutAmount = p.amount;
        address payable recipient = p.beneficiary;

        // Checks-Effects-Interactions
        eventItem.committed -= payoutAmount;
        eventItem.paid += payoutAmount;
        p.status = PayoutStatus.Paid;
        p.releasedAt = block.timestamp;

        (bool success, ) = recipient.call{value: payoutAmount}("");
        require(success, "ReliefFund: Native transfer failed");

        emit PayoutReleased(claimId, reliefId, payoutAmount, recipient);
    }

    /**
     * @notice Admin sweeps unspent, uncommitted funds after expiration
     */
    function sweepUnspent(uint256 reliefId, address payable recipient) external onlyAdmin nonReentrant {
        require(reliefId > 0 && reliefId <= totalReliefEvents, "ReliefFund: Invalid reliefId");
        require(recipient != address(0), "ReliefFund: Zero recipient address");

        ReliefEvent storage eventItem = reliefEvents[reliefId];
        require(block.timestamp > eventItem.expiresAt, "ReliefFund: Event has not expired");

        uint256 unallocated = eventItem.budget - eventItem.committed - eventItem.paid;
        require(unallocated > 0, "ReliefFund: No unallocated funds to sweep");

        eventItem.budget -= unallocated;

        (bool success, ) = recipient.call{value: unallocated}("");
        require(success, "ReliefFund: Sweep transfer failed");

        emit UnspentFundsSwept(reliefId, unallocated, recipient);
    }

    // -------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------

    function getPayout(uint256 claimId, uint256 reliefId)
        external
        view
        returns (
            PayoutStatus status,
            uint8 damageLevel,
            bytes32 damageEvidenceHash,
            uint256 amount,
            address beneficiary,
            address officer1,
            address officer2,
            uint256 releasedAt
        )
    {
        Payout storage p = payouts[reliefId][claimId];
        return (
            p.status,
            p.damageLevel,
            p.damageEvidenceHash,
            p.amount,
            p.beneficiary,
            p.officer1,
            p.officer2,
            p.releasedAt
        );
    }

    function getRelief(uint256 reliefId)
        external
        view
        returns (
            bytes32 zoneHash,
            uint256 budget,
            uint256 committed,
            uint256 paid,
            uint256 maxPerClaim,
            uint64 expiresAt,
            bool active
        )
    {
        ReliefEvent storage e = reliefEvents[reliefId];
        return (
            e.zoneHash,
            e.budget,
            e.committed,
            e.paid,
            e.maxPerClaim,
            e.expiresAt,
            e.active
        );
    }
}
