import { ethers } from "hardhat";

async function main() {
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

    const MEVHelper = await ethers.getContractFactory("MEVHelper");
    const helper = await MEVHelper.deploy(WETH, UNISWAP_ROUTER);

    await helper.waitForDeployment();

    console.log(`MEVHelper deployed to: ${await helper.getAddress()}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
