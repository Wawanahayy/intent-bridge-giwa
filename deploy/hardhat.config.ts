import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-dependency-compiler";
import * as dotenv from "dotenv";
dotenv.config();

const IRYS_RPC_URL = process.env.IRYS_RPC_URL || "https://testnet-rpc.irys.xyz/v1/execution-rpc";
const PRIVATE_KEY  = process.env.DEPLOYER_PK || "";

const config: HardhatUserConfig = {
  solidity: {
    // ⬇️ tambahkan semua versi yang dibutuhkan Uniswap V2
    compilers: [
      { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } }, // WETH9/TestUSDC/CustomRouter
      { version: "0.6.6",  settings: { optimizer: { enabled: true, runs: 200 } } }, // v2-periphery (Router02)
      { version: "0.5.16", settings: { optimizer: { enabled: true, runs: 200 } } }, // v2-core (Factory/Pair)
    ],
  },
  networks: {
    irys: {
      url: IRYS_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // biar Uniswap V2 dari node_modules ikut dikompilasi
  dependencyCompiler: {
    paths: [
      "@uniswap/v2-core/contracts/UniswapV2Factory.sol",
      "@uniswap/v2-periphery/contracts/UniswapV2Router02.sol",
    ],
  },
};

export default config;
