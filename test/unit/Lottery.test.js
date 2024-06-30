const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { networkConfig } = require("../../helper-hardhat-config")

const chainId = network.config.chainId
!(chainId == 31337)
  ? describe.skip
  : describe("Lottery Unit Test", async () => {
      let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval
      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        lottery = await ethers.getContract("Lottery", deployer)
        interval = await lottery.getInterval()
        lotteryEntranceFee = await lottery.getMinEthAmount()
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2_5Mock",
          deployer,
        )
      })

      describe("constructor", async () => {
        it("Initializes the lottery correctly", async () => {
          const lotteryState = await lottery.getLotteryState()
          const interval = await lottery.getInterval()
          assert.equal(lotteryState.toString(), "0")
          assert.equal(interval.toString(), networkConfig[chainId]["interval"])
        })
      })
      describe("enterRaffle", async () => {
        it("reverts when you don't pay enough", async () => {
          await expect(lottery.enterLottery()).to.be.reverted
        })

        it("Records player when the enter", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          const playerFromContract = await lottery.getPlayers(0)
          assert.equal(playerFromContract, deployer)
        })

        it("It emits a event on enter", async () => {
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee }),
          ).to.be.emit(lottery, "LotteryEnter")
        })

        it("It does not allow entrance when lottery is Calculating", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ])
          await network.provider.send("evm_mine", [])
          await lottery.performUpkeep("0x")
          await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to
            .be.reverted
        })
      })

      describe("checkUpKeep", async () => {
        it("returns false if people haven't send any eth", async () => {
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ])
          await network.provider.send("evm_mine", [])
          const { upkeepNeeded } = await lottery.checkUpkeep.staticCall("0x")
          assert(!upkeepNeeded)
        })

        it("returns false if lottery is not open", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ])
          await network.provider.send("evm_mine", [])
          await lottery.performUpkeep("0x")
          const lotteryState = await lottery.getLotteryState()
          const { upkeepNeeded } = await lottery.checkUpkeep.staticCall("0x")
          assert.equal(lotteryState.toString(), "1")
          assert.equal(upkeepNeeded, false)
        })
        it("return false if enough time is not passed", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            Number(interval) - 5,
          ])
          await network.provider.send("evm_mine", [])
          const { upkeepNeeded } = await lottery.checkUpkeep.staticCall("0x")
          assert(!upkeepNeeded)
        })
        it("return true if all condition statisfied", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ])
          await network.provider.send("evm_mine", [])
          const { upkeepNeeded } = await lottery.checkUpkeep.staticCall("0x")
          //upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded)
        })
      })
      describe("performUpkeep", () => {
        it("it returns true if checkupkeep is true", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ])
          await network.provider.send("evm_mine", [])
          const tx = await lottery.performUpkeep("0x")
        })
        it("It revert when checkupkeep is false", async () => {
          await expect(lottery.performUpkeep("0x")).to.be.reverted
        })
        it("It update the lottery state and emits the requestId", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ])
          await network.provider.send("evm_mine", [])
          const txResponse = await lottery.performUpkeep("0x")
          const txReceipt = await txResponse.wait(1)
          const lotteryState = await lottery.getLotteryState()
          const requestId = await txReceipt.logs[1].args.requestId
          assert(lotteryState == 1) // 0 = open, 1 = calculating
          assert(Number(requestId) > 0)
        })
      })

      describe("fullfillRandomWords", () => {
        beforeEach(async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ])
          await network.provider.send("evm_mine", [])
        })

        it("can only be called by performUpkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.target),
          ).to.be.reverted
        })

        //This test is gone be a bigger one
        it("pick a winner, resets, and sends money", async () => {
          const accounts = await ethers.getSigners()
          const startingAccountIndex = 1
          const additionalEntrants = 3
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrants;
            i++
          ) {
            const accountConnectedLottery = await lottery.connect(accounts[i])
            await accountConnectedLottery.enterLottery({
              value: lotteryEntranceFee,
            })
          }

          const startingTimeStamp = await lottery.getLastTimeStamp()
          const winnerStartingBalance = await accounts[1].provider.getBalance(
            accounts[1].address,
          )
          //PerformUpkeep calls the fullfillRandomWords function
          //So we have to wait for the fullfillRandomWords() to be called
          // But in mock we can stimulate this situation by creating a listener (new Promise)

          await new Promise(async (res, rej) => {
            //setting up the listener
            lottery.once("WinnerPicked", async () => {
              console.log("Found the event! ")
              try {
                //asserts will be here
                console.log(accounts[1].address)
                console.log(accounts[2].address)
                console.log(accounts[3].address)
                console.log(accounts[0].address)
                const recentWinner = await lottery.getRecentWinner()
                console.log("The Winner is : ", recentWinner)
                const lotteryState = await lottery.getLotteryState()
                const numberOfPlayer = await lottery.getNumberOfPlayers()
                const endingTimeStamp = await lottery.getLastTimeStamp()

                const winnerEndingBalance =
                  await accounts[1].provider.getBalance(accounts[1].address)

                assert.equal(numberOfPlayer.toString(), "0")
                assert.equal(lotteryState.toString(), "0")
                assert(endingTimeStamp > startingTimeStamp)
                assert.equal(
                  winnerEndingBalance.toString(),
                  (
                    winnerStartingBalance +
                    BigInt(additionalEntrants) * BigInt(lotteryEntranceFee) +
                    lotteryEntranceFee
                  ).toString(),
                )
              } catch (error) {
                rej(error)
              }
              res()
            })
            //below, we will fire the event, and the listener will pick it up, and resolve
            try {
              const txRes = await lottery.performUpkeep("0x")
              const txReceipt = await txRes.wait(1)
              await vrfCoordinatorV2Mock.fulfillRandomWords(
                txReceipt.logs[1].args.requestId,
                lottery.target,
              )
            } catch (error) {
              console.log(error)
            }
          })
        })
      })
    })
