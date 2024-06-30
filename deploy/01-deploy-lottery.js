const { network, ethers } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.parseEther("200")
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  const chainId = network.config.chainId
  let vrfCoordinatorV2Address, subsciptionId, vrfCoordinatorV2Mock
  if (chainId == 31337) {
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2_5Mock")
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.target
    const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
    const transactionReceipt = await transactionResponse.wait(1)
    subsciptionId = transactionReceipt.logs[0].args.subId
    await vrfCoordinatorV2Mock.fundSubscription(
      subsciptionId,
      VRF_SUB_FUND_AMOUNT
    )
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]["VRFCoordinatorV2"]
    subsciptionId = networkConfig[chainId]["subsciptionId"]
  }

  const entranceFee = networkConfig[chainId]["entranceFee"]
  const gasLane = networkConfig[chainId]["gasLane"]
  const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
  const interval = networkConfig[chainId]["interval"]
  const args = [
    vrfCoordinatorV2Address,
    entranceFee,
    gasLane,
    subsciptionId,
    callbackGasLimit,
    interval,
  ]
  const lottery = await deploy("Lottery", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: 1,
  })
  if (chainId != "31337" && process.env.ETHERSCAN_API_KEY) {
    await verify(lottery.address, args)
  } else {
    await vrfCoordinatorV2Mock.addConsumer(subsciptionId, lottery.address)
  }
  log("---------------------------------------------")
}

module.exports.tags = ["all", "lottery"]
