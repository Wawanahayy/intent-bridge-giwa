import hre from "hardhat";

async function main() {
  const { ethers } = hre;

  const [deployer] = await ethers.getSigners();
  const USDC = await ethers.getContractFactory("TestUSDC");
  const initial = ethers.parseUnits("1000000", 6); // 1,000,000 USDC
  const usdc = await USDC.deploy(6, initial, deployer.address);
  await usdc.waitForDeployment();
  console.log("TestUSDC:", await usdc.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
