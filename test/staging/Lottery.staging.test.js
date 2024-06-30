const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { networkConfig } = require("../../helper-hardhat-config")

const chainId = network.config.chainId

chainId == 31337
  ? describe.skip
  : describe("Lottery Staging Test", async () => {
      let lottery, lotteryEntranceFee, deployer
      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer
        lottery = await ethers.getContract("Lottery", deployer)
        lotteryEntranceFee = await lottery.getMinEthAmount()
      })

      describe("fullfillRandomWords", () => {
        it("it works with chainlink keepers and chainlink vrf", async () => {
          //Set up listner before we enter the lottery
          const startingTimeStamp = await lottery.getLastTimeStamp()
          const accounts = await ethers.getSigners()
          let winnerStartingBalance
          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("Winner Picked")
              try {
                // console.log("Runing the try catch block")
                const winnerEndingBalance =
                  await accounts[0].provider.getBalance(accounts[0].address)
                const recentWinner = await lottery.getRecentWinner()
                const lotteryState = await lottery.getLotteryState()
                const numberOfPlayer = await lottery.getNumberOfPlayers()
                const endingTimeStamp = await lottery.getLastTimeStamp()
                assert.equal(lotteryState.toString(), "0")
                assert.equal(numberOfPlayer.toString(), "0")
                assert.equal(recentWinner.toString(), accounts[0].address)
                assert.equal(
                  winnerEndingBalance.toString(),
                  (winnerStartingBalance + lotteryEntranceFee).toString(),
                )
                assert(startingTimeStamp < endingTimeStamp)
                resolve()
              } catch (error) {
                reject(error)
              }
            })
            try {
              console.log("Entering Raffle")
              const txResponse = await lottery.enterLottery({
                value: lotteryEntranceFee,
              })
              const txReceipt = await txResponse.wait(1)
              winnerStartingBalance = await accounts[0].provider.getBalance(
                accounts[0].address,
              )
            } catch (error) {
              console.log(error)
            }
          })
        })
      })
    })
