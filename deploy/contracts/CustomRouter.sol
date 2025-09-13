// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
}

interface IUniswapV2Router02 {
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
}

contract CustomRouter {
    address public immutable usdc;
    address public immutable weth; // WIRYS (wrapped IRYS)
    IUniswapV2Router02 public immutable uni;

    constructor(address _usdc, address _weth, address _router) {
        usdc = _usdc;
        weth = _weth;
        uni  = IUniswapV2Router02(_router);
    }

    receive() external payable {}

    function _mkPath(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);  // ✅ Fixed
        p[0] = a;
        p[1] = b;
    }

    function swapUSDCToETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external returns (uint256) {
        require(to != address(0), "bad-to");
        require(IERC20(usdc).transferFrom(msg.sender, address(this), amountIn), "transferFrom");
        require(IERC20(usdc).approve(address(uni), amountIn), "approve");

        uint[] memory amounts = uni.swapExactTokensForETH(
            amountIn,
            amountOutMin,
            _mkPath(usdc, weth),
            to,
            block.timestamp + 900
        );
        return amounts[amounts.length - 1];
    }

    function swapETHToUSDC(
        uint256 amountOutMin,
        address to
    ) external payable returns (uint256) {
        require(to != address(0), "bad-to");
        uint[] memory amounts = uni.swapExactETHForTokens{ value: msg.value }(
            amountOutMin,
            _mkPath(weth, usdc),
            to,
            block.timestamp + 900
        );
        return amounts[amounts.length - 1];
    }
}