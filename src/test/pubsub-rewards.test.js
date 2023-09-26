import chai from "chai";
import chaiHttp from "chai-http";
import {
  collectionRewardsMock,
  dbMock,
  mockResponsePath,
  mockUserHandle,
  mockUserName,
  mockUserTelegramID,
  mockWallet,
  mockAccessToken,
  mockTransactionHash,
  collectionUsersMock,
} from "./utils.js";
import { handleSignUpReward } from "../utils/webhook.js";
import Sinon from "sinon";
import axios from "axios";
import "dotenv/config";
import chaiExclude from "chai-exclude";

chai.use(chaiHttp);
chai.use(chaiExclude);

describe("handleSignUpReward function", async function () {
  let sandbox;
  let axiosStub;

  beforeEach(function () {
    sandbox = Sinon.createSandbox();
    axiosStub = sandbox
      .stub(axios, "post")
      .callsFake(async (url, data, options) => {
        if (url === "https://paymagicapi.com/v1/auth") {
          return Promise.resolve({
            data: {
              access_token: mockAccessToken,
            },
          });
        }

        if (url === "https://paymagicapi.com/v1/kernel/tx") {
          return Promise.resolve({
            data: {
              txHash: mockTransactionHash,
            },
          });
        }

        if (url == "https://api.segment.io/v1/identify") {
          return Promise.resolve({
            result: "success",
          });
        }

        if (url == process.env.FLOWXO_NEW_SIGNUP_REWARD_WEBHOOK) {
          return Promise.resolve({
            result: "success",
          });
        }
      });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("Should return true if user already exists in the database", async function () {
    await collectionRewardsMock.insertOne({
      userTelegramID: mockUserTelegramID,
      reason: "user_sign_up",
    });

    chai.expect(
      await handleSignUpReward(
        dbMock,
        mockUserTelegramID,
        mockResponsePath,
        mockUserHandle,
        mockUserName,
        mockWallet
      )
    ).to.be.true;
  });

  it("Should not add new reward to the database if user already exists in the database", async function () {
    await collectionRewardsMock.insertOne({
      userTelegramID: mockUserTelegramID,
      reason: "user_sign_up",
    });
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );
    chai
      .expect((await collectionRewardsMock.find({}).toArray()).length)
      .to.equal(1);
  });

  it("Should call the sendTokens function properly if the user is new", async function () {
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    chai
      .expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === "https://paymagicapi.com/v1/kernel/tx")
          .args[1]
      )
      .to.deep.equal({
        userId: `grindery:${process.env.SOURCE_TG_ID}`,
        chain: "matic",
        to: [process.env.G1_POLYGON_ADDRESS],
        value: ["0x00"],
        data: [
          "0xa9059cbb00000000000000000000000095222290dd7278aa3ddd389cc1e1d165cc4bafe50000000000000000000000000000000000000000000000056bc75e2d63100000",
        ],
        auth: "",
      });
  });

  it("Should insert a new element in the reward collection of the database if the user is new", async function () {
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    const rewards = await collectionRewardsMock.find({}).toArray();

    chai.expect(rewards.length).to.equal(1);
    chai.expect(rewards[0]).excluding(["_id", "dateAdded"]).to.deep.equal({
      userTelegramID: "2114356934",
      responsePath: mockResponsePath,
      walletAddress: mockWallet,
      reason: "user_sign_up",
      userHandle: mockUserHandle,
      userName: mockUserName,
      amount: "100",
      message: "Sign up reward",
      transactionHash: mockTransactionHash,
    });
    chai
      .expect(rewards[0].dateAdded)
      .to.be.greaterThan(new Date(Date.now() - 20000)); // 20 seconds
    chai.expect(rewards[0].dateAdded).to.be.lessThan(new Date());
  });

  it("Should add user to Segment properly if the user is new", async function () {
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    const segmentCallArgs = axiosStub
      .getCalls()
      .find((e) => e.firstArg === "https://api.segment.io/v1/identify").args[1];

    chai
      .expect(segmentCallArgs)
      .excluding(["timestamp"])
      .to.deep.equal({
        userId: mockUserTelegramID,
        traits: {
          responsePath: mockResponsePath,
          userHandle: mockUserHandle,
          userName: mockUserName,
          patchwallet: mockWallet,
        },
      });

    chai
      .expect(segmentCallArgs.timestamp)
      .to.be.greaterThan(new Date(Date.now() - 20000)); // 20 seconds
    chai.expect(segmentCallArgs.timestamp).to.be.lessThan(new Date());
  });

  it("Should call FlowXO webhook properly if the user is new", async function () {
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    const FlowXOCallArgs = axiosStub
      .getCalls()
      .find((e) => e.firstArg === process.env.FLOWXO_NEW_SIGNUP_REWARD_WEBHOOK)
      .args[1];

    chai.expect(FlowXOCallArgs).excluding(["dateAdded"]).to.deep.equal({
      userTelegramID: mockUserTelegramID,
      responsePath: mockResponsePath,
      walletAddress: mockWallet,
      reason: "user_sign_up",
      userHandle: mockUserHandle,
      userName: mockUserName,
      amount: "100",
      message: "Sign up reward",
      transactionHash: mockTransactionHash,
    });

    chai
      .expect(FlowXOCallArgs.dateAdded)
      .to.be.greaterThan(new Date(Date.now() - 20000)); // 20 seconds
    chai.expect(FlowXOCallArgs.dateAdded).to.be.lessThan(new Date());
  });

  it("Should return true if the user is new", async function () {
    chai.expect(
      await handleSignUpReward(
        dbMock,
        mockUserTelegramID,
        mockResponsePath,
        mockUserHandle,
        mockUserName,
        mockWallet
      )
    ).to.be.true;
  });

  it("Should not add the user in the database (in handleSignUpReward) if the user is new", async function () {
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );
    chai.expect(await collectionUsersMock.find({}).toArray()).to.be.empty;
  });

  it("Should return false if there is an error in the transaction", async function () {
    axiosStub.withArgs("https://paymagicapi.com/v1/kernel/tx").resolves({
      data: {
        error: "service non available",
      },
    });
    chai.expect(
      await handleSignUpReward(
        dbMock,
        mockUserTelegramID,
        mockResponsePath,
        mockUserHandle,
        mockUserName,
        mockWallet
      )
    ).to.be.false;
  });

  it("Should not add reward in the database if there is an error in the transaction", async function () {
    axiosStub.withArgs("https://paymagicapi.com/v1/kernel/tx").resolves({
      data: {
        error: "service non available",
      },
    });
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );
    chai.expect(await collectionRewardsMock.find({}).toArray()).to.be.empty;
  });

  it("Should not call Segment if there is an error in the transaction", async function () {
    axiosStub.withArgs("https://paymagicapi.com/v1/kernel/tx").resolves({
      data: {
        error: "service non available",
      },
    });
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    chai.expect(
      axiosStub
        .getCalls()
        .find((e) => e.firstArg === "https://api.segment.io/v1/identify")
    ).to.be.undefined;
  });

  it("Should not call FlowXO if there is an error in the transaction", async function () {
    axiosStub.withArgs("https://paymagicapi.com/v1/kernel/tx").resolves({
      data: {
        error: "service non available",
      },
    });
    await handleSignUpReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    chai.expect(
      axiosStub
        .getCalls()
        .find(
          (e) => e.firstArg === process.env.FLOWXO_NEW_SIGNUP_REWARD_WEBHOOK
        )
    ).to.be.undefined;
  });
});
