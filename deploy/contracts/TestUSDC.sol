// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestUSDC is ERC20 {
    uint8 private immutable _decimals;

    // contoh: decimals_=6, initialSupply=1_000_000 * 10**6, initialRecipient=deployer
    constructor(uint8 decimals_, uint256 initialSupply, address initialRecipient)
        ERC20("Test USD Coin", "USDC")
    {
        _decimals = decimals_;
        _mint(initialRecipient, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
