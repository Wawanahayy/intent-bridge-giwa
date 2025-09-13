import { ethers } from "hardhat";

const SEED = (process.env.SEED_LIQUIDITY || "false").toLowerCase() === "true";

// helper
const toWei  = (eth: string) => ethers.parseEther(eth);
const toUSDC = (amt: string) => ethers.parseUnits(amt, 6);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1) WIRYS (WETH9)
  const WETH9 = await ethers.getContractFactory("WETH9"); // dari periphery test
  const weth = await WETH9.deploy();
  await weth.waitForDeployment();
  const WETH = await weth.getAddress();
  console.log("WETH9:", WETH);

  // 2) Uniswap V2 Factory
  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(deployer.address); // feeToSetter
  await factory.waitForDeployment();
  const FACTORY = await factory.getAddress();
  console.log("V2 Factory:", FACTORY);

  // 3) Uniswap V2 Router02
  const Router02 = await ethers.getContractFactory("UniswapV2Router02");
  const router = await Router02.deploy(FACTORY, WETH);
  await router.waitForDeployment();
  const V2ROUTER = await router.getAddress();
  console.log("V2 Router02:", V2ROUTER);

  // 4) Test USDC (6 desimal)
  const USDCF = await ethers.getContractFactory("TestUSDC");
  const initial = toUSDC("1000000"); // 1,000,000 USDC
  const usdc = await USDCF.deploy(6, initial, deployer.address);
  await usdc.waitForDeployment();
  const USDC = await usdc.getAddress();
  console.log("TestUSDC:", USDC);

  // 5) CustomRouter (USDC <-> native lewat V2Router; WETH utk bridging)
  const CR = await ethers.getContractFactory("CustomRouter");
  const custom = await CR.deploy(USDC, WETH, V2ROUTER);
  await custom.waitForDeployment();
  const CUSTOM_ROUTER = await custom.getAddress();
  console.log("CustomRouter:", CUSTOM_ROUTER);

  // 6) (Opsional) Seed LP USDC–WETH via addLiquidityETH
  if (SEED) {
    const r = await ethers.getContractAt("UniswapV2Router02", V2ROUTER);

    // approve USDC ke router
    await (await usdc.approve(V2ROUTER, toUSDC("1000000"))).wait();

    const amountTokenDesired = toUSDC("1000"); // 1,000 USDC
    const amountTokenMin     = toUSDC("900");  // slippage buffer
    const amountETHMin       = toWei("0.09");
    const ethToAdd           = toWei("0.1");  // 0.1 IRYS

    const deadline = Math.floor(Date.now()/1000) + 1200; // +20m
    const tx = await r.addLiquidityETH(
      USDC,
      amountTokenDesired,
      amountTokenMin,
      amountETHMin,
      deployer.address,
      deadline,
      { value: ethToAdd }
    );
    await tx.wait();
    console.log("✅ Seeded LP USDC-WETH with 1000 USDC + 0.1 IRYS");
  }

  console.log("\n========= COPY KE .env FRONTEND =========");
  console.log(`NEXT_PUBLIC_V2_ROUTER_IRYS=${V2ROUTER}`);
  console.log(`NEXT_PUBLIC_USDC_IRYS=${USDC}`);
  console.log(`NEXT_PUBLIC_CUSTOM_ROUTER_IRYS=${CUSTOM_ROUTER}`);
  console.log(`NEXT_PUBLIC_WIRYS_IRYS=${WETH}`);
  console.log(`NEXT_PUBLIC_VERIFIED_TOKENS_IRYS=IRYS:native,USDC:${USDC}`);
  console.log("=========================================\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
