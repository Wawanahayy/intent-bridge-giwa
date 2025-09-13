import hre from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const USDC = process.env.USDC!;
const WETH = process.env.WETH!;
const V2ROUTER = process.env.V2ROUTER!;

async function main() {
  const { ethers } = hre;

  if (!USDC || !WETH || !V2ROUTER) throw new Error("Set USDC,WETH,V2ROUTER in env");
  const Router = await ethers.getContractFactory("CustomRouter");
  const r = await Router.deploy(USDC, WETH, V2ROUTER);
  await r.waitForDeployment();
  console.log("CustomRouter:", await r.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
