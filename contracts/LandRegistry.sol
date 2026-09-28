// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LandRegistry
 * @dev Post-Disaster Community-Attested Land Rights Registry on MST Blockchain Testnet
 * Built for BMS College of Engineering 24-Hour Buildathon (September 28–29, 2026)
 */
contract LandRegistry {
    enum ClaimStatus { Pending, Verified, Disputed }

    struct Claim {
        bytes32 ownerHash;       // SHA-256(NationalID + Salt) - Zero PII on-chain
        bytes32 evidenceHash;    // SHA-256(Photos + GeoJSON + Witnesses)
        uint32 latE6;            // Centroid latitude * 10^6
        uint32 lonE6;            // Centroid longitude * 10^6
        uint8 score;             // Trust consensus score
        ClaimStatus status;      // Pending (0), Verified (1), Disputed (2)
        uint256 timestamp;       // Block timestamp
    }

    uint256 public claimCounter;
    mapping(uint256 => Claim) public claims;
    mapping(uint256 => mapping(address => bool)) public hasAttested;

    address public admin;

    // Events
    event ClaimCreated(uint256 indexed claimId, bytes32 indexed ownerHash, uint32 latE6, uint32 lonE6);
    event Attested(uint256 indexed claimId, address indexed attester, uint8 role, uint8 newScore);
    event ClaimVerified(uint256 indexed claimId, uint8 finalScore);
    event ClaimDisputed(uint256 indexed claimId, string reason);
    event DisputeResolved(uint256 indexed claimId, ClaimStatus newStatus);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin authorized");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @notice Create a new land claim record
     */
    function createClaim(
        bytes32 _ownerHash,
        bytes32 _evidenceHash,
        uint32 _latE6,
        uint32 _lonE6
    ) external returns (uint256) {
        claimCounter++;
        uint256 newId = claimCounter;

        claims[newId] = Claim({
            ownerHash: _ownerHash,
            evidenceHash: _evidenceHash,
            latE6: _latE6,
            lonE6: _lonE6,
            score: 0,
            status: ClaimStatus.Pending,
            timestamp: block.timestamp
        });

        emit ClaimCreated(newId, _ownerHash, _latE6, _lonE6);
        return newId;
    }

    /**
     * @notice Cast a role-weighted community attestation
     * Role 1 = Neighbor (+1), Role 2 = Village Leader (+3), Role 3 = Accredited NGO (+3)
     */
    function attest(uint256 _claimId, uint8 _role) external {
        require(_claimId > 0 && _claimId <= claimCounter, "Invalid claim ID");
        Claim storage c = claims[_claimId];
        require(c.status != ClaimStatus.Disputed, "Cannot attest a disputed claim");
        require(!hasAttested[_claimId][msg.sender], "Address already attested this claim");

        uint8 weight = 1;
        if (_role == 2) weight = 3; // Village Leader
        if (_role == 3) weight = 3; // Accredited NGO

        c.score += weight;
        hasAttested[_claimId][msg.sender] = true;

        emit Attested(_claimId, msg.sender, _role, c.score);

        // Auto-verify if consensus score reaches threshold (>= 5)
        if (c.score >= 5 && c.status == ClaimStatus.Pending) {
            c.status = ClaimStatus.Verified;
            emit ClaimVerified(_claimId, c.score);
        }
    }

    /**
     * @notice Flag a parcel boundary conflict or contested ownership
     */
    function dispute(uint256 _claimId) external {
        require(_claimId > 0 && _claimId <= claimCounter, "Invalid claim ID");
        Claim storage c = claims[_claimId];
        c.status = ClaimStatus.Disputed;

        emit ClaimDisputed(_claimId, "Spatial conflict or boundary dispute flagged");
    }

    /**
     * @notice Admin / Arbiter resolves a dispute
     */
    function resolveDispute(uint256 _claimId, bool _restore) external onlyAdmin {
        require(_claimId > 0 && _claimId <= claimCounter, "Invalid claim ID");
        Claim storage c = claims[_claimId];

        if (_restore) {
            c.status = c.score >= 5 ? ClaimStatus.Verified : ClaimStatus.Pending;
        } else {
            c.status = ClaimStatus.Disputed;
        }

        emit DisputeResolved(_claimId, c.status);
    }

    /**
     * @notice Gasless view query returning full claim metadata
     */
    function getClaim(uint256 _claimId) external view returns (
        bytes32 ownerHash,
        bytes32 evidenceHash,
        uint32 latE6,
        uint32 lonE6,
        uint8 score,
        uint8 status
    ) {
        require(_claimId > 0 && _claimId <= claimCounter, "Invalid claim ID");
        Claim memory c = claims[_claimId];
        return (
            c.ownerHash,
            c.evidenceHash,
            c.latE6,
            c.lonE6,
            c.score,
            uint8(c.status)
        );
    }
}
