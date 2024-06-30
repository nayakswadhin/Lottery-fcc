const { network, ethers } = require("hardhat")

const BASE_FEE = ethers.parseEther("0.25")
const GAS_PRICE_LINK = 1e9
const _WEIPERUNITLINK = 4323045521844006

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments
  const chainId = network.config.chainId
  if (chainId == 31337) {
    const { deployer } = await getNamedAccounts()
    const accounts = await ethers.getSigners()
    const signer = accounts[0]
    log("Local Network Detected!! Deploying mocks... ")
    //Deploy the mock contract
    const args = [BASE_FEE, GAS_PRICE_LINK, _WEIPERUNITLINK]
    await deploy("VRFCoordinatorV2_5Mock", {
      from: deployer,
      log: true,
      args: args,
    })
    log("Mocks Deployed")
    log("---------------------------------------------------------------")
  }
}

module.exports.tags = ["all", "mocks"]
