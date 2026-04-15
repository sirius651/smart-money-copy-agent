import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying TradeLogger with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "OKB");

  const TradeLogger = await ethers.getContractFactory("TradeLogger");
  const tradeLogger = await TradeLogger.deploy();
  await tradeLogger.waitForDeployment();

  const address = await tradeLogger.getAddress();
  console.log("TradeLogger deployed to:", address);
  console.log("Network: X Layer Testnet (chainId 195)");
  console.log("Explorer: https://www.oklink.com/xlayer-test/address/" + address);

  // Write the deployed address back to a JSON file so the Next.js app can read it
  const deployInfo = {
    address,
    network: "xlayerTestnet",
    chainId: 1952,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  const outPath = path.resolve(__dirname, "../../lib/deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(deployInfo, null, 2));
  console.log("Deployment info written to lib/deployments.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
