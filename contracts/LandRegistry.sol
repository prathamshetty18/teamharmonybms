// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LandRegistry
 * @notice Post-disaster community-attested land rights on MST Testnet.
 * @dev Role-based weights, zero on-chain PII, claimant-bound payouts, arbiter dispute resolution.
 */
contract LandRegistry {
    enum ClaimStatus {
        Pending,   // 0
        Verified,  // 1
        Disputed   // 2
    }

    enum Role {
        None,      // 0
        Neighbor,  // 1 (weight: +1)
        Leader,    // 2 (weight: +3)
        NGO        // 3 (weight: +3)
    }

    struct Claim {
        address claimant;        // Bound claimant address
        bytes32 ownerHash;       // sha256(NationalID + Salt)
        bytes32 evidenceHash;    // sha256(Photos + GeoJSON + Witnesses)
        int32 latE6;             // Latitude in micro-degrees (-90 to +90 * 1e6)
        int32 lonE6;             // Longitude in micro-degrees (-180 to +180 * 1e6)
        uint32 score;            // Cumulative community trust score
        uint32 round;            // Attestation round (incremented on failed dispute)
        ClaimStatus status;      // Pending, Verified, or Disputed
        uint256 createdAt;       // Timestamp
    }

    address public admin;
    address public registrar;
    address public arbiter;
    uint256 public totalClaims;

    // claimId => Claim
    mapping(uint256 => Claim) public claims;

    // user => Role
    mapping(address => Role) public roles;

    // claimId => round => attester => bool
    mapping(uint256 => mapping(uint32 => mapping(address => bool))) public hasAttested;

    event ClaimCreated(
        uint256 indexed claimId,
        address indexed claimant,
        bytes32 indexed ownerHash,
        bytes32 evidenceHash,
        int32 latE6,
        int32 lonE6
    );

    event ClaimAttested(
        uint256 indexed claimId,
        address indexed attester,
        Role role,
        uint32 newScore,
        ClaimStatus newStatus
    );

    event ClaimDisputed(uint256 indexed claimId, address indexed reporter);
    event DisputeResolved(uint256 indexed claimId, ClaimStatus newStatus, uint32 round);
    event RegistrarUpdated(address indexed registrar);
    event ArbiterUpdated(address indexed arbiter);
    event RoleUpdated(address indexed user, Role role);

    modifier onlyAdmin() {
        require(msg.sender == admin, "LandRegistry: Only admin");
        _;
    }

    modifier onlyRegistrar() {
        require(msg.sender == registrar || msg.sender == admin, "LandRegistry: Only registrar");
        _;
    }

    modifier onlyRegistrarOrArbiter() {
        require(
            msg.sender == registrar || msg.sender == arbiter || msg.sender == admin,
            "LandRegistry: Only registrar or arbiter"
        );
        _;
    }

    modifier onlyArbiterOrAdmin() {
        require(msg.sender == arbiter || msg.sender == admin, "LandRegistry: Only arbiter or admin");
        _;
    }

    constructor() {
        admin = msg.sender;
        registrar = msg.sender;
        arbiter = msg.sender;
    }

    function setRegistrar(address _registrar) external onlyAdmin {
        require(_registrar != address(0), "LandRegistry: Zero address");
        registrar = _registrar;
        emit RegistrarUpdated(_registrar);
    }

    function setArbiter(address _arbiter) external onlyAdmin {
        require(_arbiter != address(0), "LandRegistry: Zero address");
        arbiter = _arbiter;
        emit ArbiterUpdated(_arbiter);
    }

    function setRole(address user, Role role) external onlyAdmin {
        require(user != address(0), "LandRegistry: Zero address");
        roles[user] = role;
        emit RoleUpdated(user, role);
    }

    /**
     * @notice Registrar creates a verified-entry claim bound to claimant address
     */
    function createClaim(
        address claimant,
        bytes32 ownerHash,
        bytes32 evidenceHash,
        int32 latE6,
        int32 lonE6
    ) external onlyRegistrar returns (uint256 claimId) {
        require(claimant != address(0), "LandRegistry: Invalid claimant address");
        require(ownerHash != bytes32(0), "LandRegistry: ownerHash cannot be empty");
        require(evidenceHash != bytes32(0), "LandRegistry: evidenceHash cannot be empty");
        require(latE6 >= -90000000 && latE6 <= 90000000, "LandRegistry: lat out of range");
        require(lonE6 >= -180000000 && lonE6 <= 180000000, "LandRegistry: lon out of range");

        totalClaims += 1;
        claimId = totalClaims;

        claims[claimId] = Claim({
            claimant: claimant,
            ownerHash: ownerHash,
            evidenceHash: evidenceHash,
            latE6: latE6,
            lonE6: lonE6,
            score: 0,
            round: 1,
            status: ClaimStatus.Pending,
            createdAt: block.timestamp
        });

        emit ClaimCreated(claimId, claimant, ownerHash, evidenceHash, latE6, lonE6);
    }

    /**
     * @notice Attest a claim. Role is read strictly from caller's assigned role.
     */
    function attest(uint256 claimId) external {
        require(claimId > 0 && claimId <= totalClaims, "LandRegistry: Invalid claimId");
        Claim storage claim = claims[claimId];
        require(claim.status != ClaimStatus.Disputed, "LandRegistry: Claim is disputed");
        require(msg.sender != claim.claimant, "LandRegistry: Claimant cannot self-attest");

        Role role = roles[msg.sender];
        require(role != Role.None, "LandRegistry: Caller has no attester role");
        require(!hasAttested[claimId][claim.round][msg.sender], "LandRegistry: Already attested in this round");

        uint32 weight = 0;
        if (role == Role.Neighbor) {
            weight = 1;
        } else if (role == Role.Leader) {
            weight = 3;
        } else if (role == Role.NGO) {
            weight = 3;
        }

        hasAttested[claimId][claim.round][msg.sender] = true;
        claim.score += weight;

        // Auto-verify if score threshold (>= 5) is met and claim was pending
        if (claim.score >= 5 && claim.status == ClaimStatus.Pending) {
            claim.status = ClaimStatus.Verified;
        }

        emit ClaimAttested(claimId, msg.sender, role, claim.score, claim.status);
    }

    /**
     * @notice Registrar or Arbiter flags a claim as Disputed
     */
    function dispute(uint256 claimId) external onlyRegistrarOrArbiter {
        require(claimId > 0 && claimId <= totalClaims, "LandRegistry: Invalid claimId");
        Claim storage claim = claims[claimId];
        claim.status = ClaimStatus.Disputed;

        emit ClaimDisputed(claimId, msg.sender);
    }

    /**
     * @notice Arbiter resolves dispute.
     * @dev restore=true recomputes Verified only if score >= 5.
     *      restore=false resets score to 0 and bumps round counter to prevent instant re-verification.
     */
    function resolveDispute(uint256 claimId, bool restore) external onlyArbiterOrAdmin {
        require(claimId > 0 && claimId <= totalClaims, "LandRegistry: Invalid claimId");
        Claim storage claim = claims[claimId];
        require(claim.status == ClaimStatus.Disputed, "LandRegistry: Not disputed");

        if (restore) {
            claim.status = (claim.score >= 5) ? ClaimStatus.Verified : ClaimStatus.Pending;
        } else {
            claim.score = 0;
            claim.round += 1;
            claim.status = ClaimStatus.Pending;
        }

        emit DisputeResolved(claimId, claim.status, claim.round);
    }

    // -------------------------------------------------------------
    // Cheap cross-contract views
    // -------------------------------------------------------------

    function statusOf(uint256 claimId) external view returns (ClaimStatus) {
        require(claimId > 0 && claimId <= totalClaims, "LandRegistry: Invalid claimId");
        return claims[claimId].status;
    }

    function claimantOf(uint256 claimId) external view returns (address) {
        require(claimId > 0 && claimId <= totalClaims, "LandRegistry: Invalid claimId");
        return claims[claimId].claimant;
    }

    function getClaim(uint256 claimId)
        external
        view
        returns (
            address claimant,
            bytes32 ownerHash,
            bytes32 evidenceHash,
            int32 latE6,
            int32 lonE6,
            uint32 score,
            uint32 round,
            ClaimStatus status,
            uint256 createdAt
        )
    {
        require(claimId > 0 && claimId <= totalClaims, "LandRegistry: Invalid claimId");
        Claim storage c = claims[claimId];
        return (
            c.claimant,
            c.ownerHash,
            c.evidenceHash,
            c.latE6,
            c.lonE6,
            c.score,
            c.round,
            c.status,
            c.createdAt
        );
    }
}
