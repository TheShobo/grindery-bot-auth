import chai from 'chai';
import {
  mockResponsePath,
  mockUserName,
  mockUserTelegramID,
  mockWallet,
  mockAccessToken,
  mockTransactionHash,
  mockUserHandle,
  mockUserOpHash,
  mockToSwap,
  mockDataSwap,
  mockTokenIn,
  mockAmountIn,
  mockTokenOut,
  mockAmountOut,
  mockPriceImpact,
  mockGas,
  mockFromSwap,
  mockTokenInSymbol,
  mockTokenOutSymbol,
  mockChainName,
  mockChainId,
  getCollectionUsersMock,
  getCollectionSwapsMock,
  mockValue,
} from './utils';
import Sinon from 'sinon';
import axios from 'axios';

import chaiExclude from 'chai-exclude';
import {
  DEFAULT_CHAIN_ID,
  PATCHWALLET_AUTH_URL,
  PATCHWALLET_RESOLVER_URL,
  PATCHWALLET_TX_STATUS_URL,
  PATCHWALLET_TX_URL,
  SEGMENT_TRACK_URL,
  TRANSACTION_STATUS,
} from '../utils/constants';
import { v4 as uuidv4 } from 'uuid';
import { handleSwap } from '../utils/webhooks/swap';
import { FLOWXO_NEW_SWAP_WEBHOOK } from '../../secrets';
import { Collection, Document } from 'mongodb';

chai.use(chaiExclude);

describe('handleSwap function', async function () {
  let sandbox: Sinon.SinonSandbox;
  let axiosStub;
  let swapId: string;
  let collectionUsersMock: Collection<Document>;
  let collectionSwapsMock: Collection<Document>;

  beforeEach(async function () {
    collectionUsersMock = await getCollectionUsersMock();
    collectionSwapsMock = await getCollectionSwapsMock();

    sandbox = Sinon.createSandbox();
    axiosStub = sandbox.stub(axios, 'post').callsFake(async (url: string) => {
      if (url === PATCHWALLET_RESOLVER_URL) {
        return Promise.resolve({
          data: {
            users: [{ accountAddress: mockWallet }],
          },
        });
      }

      if (url === PATCHWALLET_TX_URL) {
        return Promise.resolve({
          data: {
            txHash: mockTransactionHash,
          },
        });
      }

      if (url === PATCHWALLET_TX_STATUS_URL) {
        return Promise.resolve({
          data: {
            txHash: mockTransactionHash,
            userOpHash: mockUserOpHash,
          },
        });
      }

      if (url === PATCHWALLET_AUTH_URL) {
        return Promise.resolve({
          data: {
            access_token: mockAccessToken,
          },
        });
      }

      if (url == FLOWXO_NEW_SWAP_WEBHOOK) {
        return Promise.resolve({
          result: 'success',
        });
      }

      if (url == SEGMENT_TRACK_URL) {
        return Promise.resolve({
          result: 'success',
        });
      }

      throw new Error('Unexpected URL encountered');
    });

    swapId = uuidv4();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('Normal process to handle a swap', async function () {
    beforeEach(async function () {
      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
        responsePath: mockResponsePath,
      });
    });

    it('Should return true', async function () {
      chai.expect(
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          userTelegramID: mockUserTelegramID,
          to: mockToSwap,
          data: mockDataSwap,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        }),
      ).to.be.true;
    });

    it('Should populate swaps database', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        userTelegramID: mockUserTelegramID,
        to: mockToSwap,
        data: mockDataSwap,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
        chainId: mockChainId,
        chainName: mockChainName,
      });

      const swaps = await collectionSwapsMock.find({}).toArray();

      chai
        .expect(swaps)
        .excluding(['dateAdded', '_id'])
        .to.deep.equal([
          {
            eventId: swapId,
            chainId: mockChainId,
            userTelegramID: mockUserTelegramID,
            userWallet: mockWallet,
            userName: mockUserName,
            userHandle: mockUserHandle,
            tokenIn: mockTokenIn,
            amountIn: mockAmountIn,
            tokenOut: mockTokenOut,
            amountOut: mockAmountOut,
            priceImpact: mockPriceImpact,
            gas: mockGas,
            from: mockFromSwap,
            tokenInSymbol: mockTokenInSymbol,
            tokenOutSymbol: mockTokenOutSymbol,
            status: TRANSACTION_STATUS.SUCCESS,
            transactionHash: mockTransactionHash,
            to: mockToSwap,
            userOpHash: null,
          },
        ]);
      chai.expect(swaps[0].dateAdded).to.be.a('date');
    });

    it('Should populate the segment swap properly', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        userTelegramID: mockUserTelegramID,
        to: mockToSwap,
        data: mockDataSwap,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      const segmentIdentityCall = axiosStub
        .getCalls()
        .filter((e) => e.firstArg === SEGMENT_TRACK_URL);

      chai
        .expect(segmentIdentityCall[0].args[1])
        .excluding(['timestamp'])
        .to.deep.equal({
          userId: mockUserTelegramID,
          event: 'Swap',
          properties: {
            eventId: swapId,
            chainId: DEFAULT_CHAIN_ID,
            userTelegramID: mockUserTelegramID,
            tokenIn: mockTokenIn,
            amountIn: mockAmountIn,
            tokenOut: mockTokenOut,
            amountOut: mockAmountOut,
            priceImpact: mockPriceImpact,
            gas: mockGas,
            to: mockToSwap,
            from: mockFromSwap,
            tokenInSymbol: mockTokenInSymbol,
            tokenOutSymbol: mockTokenOutSymbol,
            status: TRANSACTION_STATUS.SUCCESS,
            transactionHash: mockTransactionHash,
          },
        });
    });

    it('Should call FlowXO webhook properly for new swaps', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      const FlowXOCallArgs = axiosStub
        .getCalls()
        .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK).args[1];

      chai.expect(FlowXOCallArgs).excluding(['dateAdded']).to.deep.equal({
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        userWallet: mockWallet,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
        status: TRANSACTION_STATUS.SUCCESS,
        transactionHash: mockTransactionHash,
      });
    });

    it('Should call the swapTokens function properly', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: 'eip155:59144',
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
        data: '0xa9059cbb00000000000000000000000095222290dd7278aa3ddd389cc1e1d165cc4bafe50000000000000000000000000000000000000000000000000000000000000064',
      });

      chai
        .expect(
          axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL)
            .args[1],
        )
        .to.deep.equal({
          userId: `grindery:${mockUserTelegramID}`,
          chain: 'linea',
          to: [mockToSwap],
          value: [mockValue],
          data: [
            '0xa9059cbb00000000000000000000000095222290dd7278aa3ddd389cc1e1d165cc4bafe50000000000000000000000000000000000000000000000000000000000000064',
          ],
          delegatecall: 1,
          auth: '',
        });
    });
  });

  describe('Swap is already a success', async function () {
    beforeEach(async function () {
      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
      });

      await collectionSwapsMock.insertOne({
        eventId: swapId,
        status: TRANSACTION_STATUS.SUCCESS,
      });
    });

    it('Should return true if swap is already a success', async function () {
      chai.expect(
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        }),
      ).to.be.true;
    });

    it('Should not swap token if swap is already a success', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
      ).to.be.undefined;
    });

    it('Should not modify database if swap is already a success', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['_id'])
        .to.deep.equal([
          {
            eventId: swapId,
            status: TRANSACTION_STATUS.SUCCESS,
          },
        ]);
    });

    it('Should not call FlowXO if swap is already a success', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if swap is already a success', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  describe('Transaction if swap is already a failure', async function () {
    beforeEach(async function () {
      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
      });

      await collectionSwapsMock.insertOne({
        eventId: swapId,
        status: TRANSACTION_STATUS.FAILURE,
      });
    });

    it('Should return true if swap is already a failure', async function () {
      chai.expect(
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        }),
      ).to.be.true;
    });

    it('Should not swap if swap if is already a failure', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
      ).to.be.undefined;
    });

    it('Should not modify database if swap is already a failure', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['_id'])
        .to.deep.equal([
          {
            eventId: swapId,
            status: TRANSACTION_STATUS.FAILURE,
          },
        ]);
    });

    it('Should not call FlowXO if swap is already a failure', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if swap is already a failure', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  describe('Error in swap token request', async function () {
    beforeEach(async function () {
      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
      });

      axiosStub.withArgs(PATCHWALLET_TX_URL).resolves({
        data: {
          error: 'service non available',
        },
      });
    });

    it('Should return false if there is an error in the swap tokens request', async function () {
      const result = await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(result).to.be.false;
    });

    it('Should not modify transaction status in the database if there is an error in the swap tokens request', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['_id', 'dateAdded'])
        .to.deep.equal([
          {
            chainId: DEFAULT_CHAIN_ID,
            userTelegramID: mockUserTelegramID,
            tokenIn: mockTokenIn,
            amountIn: mockAmountIn,
            tokenOut: mockTokenOut,
            amountOut: mockAmountOut,
            priceImpact: mockPriceImpact,
            gas: mockGas,
            to: mockToSwap,
            from: mockFromSwap,
            tokenInSymbol: mockTokenInSymbol,
            tokenOutSymbol: mockTokenOutSymbol,
            eventId: swapId,
            status: TRANSACTION_STATUS.PENDING,
            transactionHash: null,
            userHandle: mockUserHandle,
            userName: mockUserName,
            userOpHash: null,
            userWallet: mockWallet,
          },
        ]);
    });

    it('Should not call FlowXO if there is an error in the swap tokens request', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if there is an error in the swap tokens request', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });
      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  it('Should not add new swap if one with the same eventId already exists', async function () {
    await collectionSwapsMock.insertOne({
      eventId: swapId,
    });

    const objectId = (
      await collectionSwapsMock.findOne({
        eventId: swapId,
      })
    )._id.toString();

    await collectionUsersMock.insertOne({
      userTelegramID: mockUserTelegramID,
      userName: mockUserName,
      userHandle: mockUserHandle,
      patchwallet: mockWallet,
    });

    await handleSwap({
      value: mockAmountIn,
      eventId: swapId,
      chainId: DEFAULT_CHAIN_ID,
      userTelegramID: mockUserTelegramID,
      tokenIn: mockTokenIn,
      amountIn: mockAmountIn,
      tokenOut: mockTokenOut,
      amountOut: mockAmountOut,
      priceImpact: mockPriceImpact,
      gas: mockGas,
      from: mockFromSwap,
      tokenInSymbol: mockTokenInSymbol,
      tokenOutSymbol: mockTokenOutSymbol,
    });

    chai
      .expect((await collectionSwapsMock.find({}).toArray())[0]._id.toString())
      .to.equal(objectId);
  });

  describe('Sender is not a user', async function () {
    it('Should return true if sender is not a user', async function () {
      const result = await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(result).to.be.true;
    });

    it('Should not save swap in database if sender is not a user', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['_id', 'dateAdded'])
        .to.deep.equal([]);
    });

    it('Should not swap tokens if sender is not a user', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
      ).to.be.undefined;
    });

    it('Should not call FlowXO if sender is not a user', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if sender is not a user', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  describe('Error in PatchWallet transaction', async function () {
    beforeEach(async function () {
      axiosStub
        .withArgs(PATCHWALLET_TX_URL)
        .rejects(new Error('Service not available'));

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
        responsePath: mockResponsePath,
      });
    });

    it('Should return false if error in PatchWallet transaction', async function () {
      const result = await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(result).to.be.false;
    });

    it('Should not modify database if error in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['_id', 'dateAdded'])
        .to.deep.equal([
          {
            chainId: DEFAULT_CHAIN_ID,
            userTelegramID: mockUserTelegramID,
            tokenIn: mockTokenIn,
            amountIn: mockAmountIn,
            tokenOut: mockTokenOut,
            amountOut: mockAmountOut,
            priceImpact: mockPriceImpact,
            gas: mockGas,
            to: mockToSwap,
            from: mockFromSwap,
            tokenInSymbol: mockTokenInSymbol,
            tokenOutSymbol: mockTokenOutSymbol,
            eventId: swapId,
            status: TRANSACTION_STATUS.PENDING,
            transactionHash: null,
            userOpHash: null,
            userHandle: mockUserHandle,
            userName: mockUserName,
            userWallet: mockWallet,
          },
        ]);
    });

    it('Should not call FlowXO if error in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if error in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  describe('PatchWallet 470 error', async function () {
    beforeEach(async function () {
      axiosStub.withArgs(PATCHWALLET_TX_URL).rejects({
        response: {
          status: 470,
        },
      });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
        responsePath: mockResponsePath,
      });
    });

    it('Should return true if error 470 in PatchWallet transaction', async function () {
      const result = await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(result).to.be.true;
    });

    it('Should complete db status to failure in database if error 470 in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['dateAdded', '_id'])
        .to.deep.equal([
          {
            chainId: DEFAULT_CHAIN_ID,
            userTelegramID: mockUserTelegramID,
            userName: mockUserName,
            userHandle: mockUserHandle,
            userWallet: mockWallet,
            tokenIn: mockTokenIn,
            amountIn: mockAmountIn,
            tokenOut: mockTokenOut,
            amountOut: mockAmountOut,
            priceImpact: mockPriceImpact,
            gas: mockGas,
            to: mockToSwap,
            from: mockFromSwap,
            tokenInSymbol: mockTokenInSymbol,
            tokenOutSymbol: mockTokenOutSymbol,
            eventId: swapId,
            status: TRANSACTION_STATUS.FAILURE,
            transactionHash: null,
            userOpHash: null,
          },
        ]);
    });

    it('Should not call FlowXO if error 470 in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if error 470 in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  describe('PatchWallet 400 error', async function () {
    beforeEach(async function () {
      axiosStub.withArgs(PATCHWALLET_TX_URL).rejects({
        response: {
          status: 400,
        },
      });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
        responsePath: mockResponsePath,
      });
    });

    it('Should return true if error 400 in PatchWallet transaction', async function () {
      const result = await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(result).to.be.true;
    });

    it('Should complete db status to failure in database if error 400 in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['dateAdded', '_id'])
        .to.deep.equal([
          {
            chainId: DEFAULT_CHAIN_ID,
            userTelegramID: mockUserTelegramID,
            userName: mockUserName,
            userHandle: mockUserHandle,
            userWallet: mockWallet,
            tokenIn: mockTokenIn,
            amountIn: mockAmountIn,
            tokenOut: mockTokenOut,
            amountOut: mockAmountOut,
            priceImpact: mockPriceImpact,
            gas: mockGas,
            to: mockToSwap,
            from: mockFromSwap,
            tokenInSymbol: mockTokenInSymbol,
            tokenOutSymbol: mockTokenOutSymbol,
            eventId: swapId,
            status: TRANSACTION_STATUS.FAILURE,
            transactionHash: null,
            userOpHash: null,
          },
        ]);
    });

    it('Should not call FlowXO if error 400 in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if error 400 in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  describe('No hash in PatchWallet transaction', async function () {
    beforeEach(async function () {
      axiosStub.withArgs(PATCHWALLET_TX_URL).resolves({
        data: {
          error: 'service non available',
        },
      });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID,
        userName: mockUserName,
        userHandle: mockUserHandle,
        patchwallet: mockWallet,
        responsePath: mockResponsePath,
      });
    });

    it('Should return false if no hash in PatchWallet transaction', async function () {
      const result = await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(result).to.be.false;
    });

    it('Should do no swap status modification in database if no hash in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        to: mockToSwap,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai
        .expect(await collectionSwapsMock.find({}).toArray())
        .excluding(['_id', 'dateAdded'])
        .to.deep.equal([
          {
            chainId: DEFAULT_CHAIN_ID,
            userTelegramID: mockUserTelegramID,
            tokenIn: mockTokenIn,
            amountIn: mockAmountIn,
            tokenOut: mockTokenOut,
            amountOut: mockAmountOut,
            priceImpact: mockPriceImpact,
            gas: mockGas,
            to: mockToSwap,
            from: mockFromSwap,
            tokenInSymbol: mockTokenInSymbol,
            tokenOutSymbol: mockTokenOutSymbol,
            eventId: swapId,
            status: TRANSACTION_STATUS.PENDING,
            transactionHash: null,
            userOpHash: null,
            userHandle: mockUserHandle,
            userName: mockUserName,
            userWallet: mockWallet,
          },
        ]);
    });

    it('Should not call FlowXO if no hash in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
      ).to.be.undefined;
    });

    it('Should not call Segment if no hash in PatchWallet transaction', async function () {
      await handleSwap({
        value: mockAmountIn,
        eventId: swapId,
        chainId: DEFAULT_CHAIN_ID,
        userTelegramID: mockUserTelegramID,
        tokenIn: mockTokenIn,
        amountIn: mockAmountIn,
        tokenOut: mockTokenOut,
        amountOut: mockAmountOut,
        priceImpact: mockPriceImpact,
        gas: mockGas,
        from: mockFromSwap,
        tokenInSymbol: mockTokenInSymbol,
        tokenOutSymbol: mockTokenOutSymbol,
      });

      chai.expect(
        axiosStub.getCalls().find((e) => e.firstArg === SEGMENT_TRACK_URL),
      ).to.be.undefined;
    });
  });

  describe('Get transaction hash via userOpHash if transaction hash is empty first', async function () {
    describe('Transaction hash is empty in tx PatchWallet endpoint', async function () {
      beforeEach(async function () {
        await collectionUsersMock.insertOne({
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          patchwallet: mockWallet,
          responsePath: mockResponsePath,
        });

        axiosStub.withArgs(PATCHWALLET_TX_URL).resolves({
          data: {
            txHash: '',
            userOpHash: mockUserOpHash,
          },
        });
      });

      it('Should return false if transaction hash is empty in tx PatchWallet endpoint', async function () {
        const result = await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(result).to.be.false;
      });

      it('Should update reward database with a pending_hash status and userOpHash if transaction hash is empty in tx PatchWallet endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai
          .expect(await collectionSwapsMock.find({}).toArray())
          .excluding(['_id', 'dateAdded'])
          .to.deep.equal([
            {
              chainId: DEFAULT_CHAIN_ID,
              userTelegramID: mockUserTelegramID,
              userName: mockUserName,
              userHandle: mockUserHandle,
              userWallet: mockWallet,
              tokenIn: mockTokenIn,
              amountIn: mockAmountIn,
              tokenOut: mockTokenOut,
              amountOut: mockAmountOut,
              priceImpact: mockPriceImpact,
              gas: mockGas,
              to: mockToSwap,
              from: mockFromSwap,
              tokenInSymbol: mockTokenInSymbol,
              tokenOutSymbol: mockTokenOutSymbol,
              eventId: swapId,
              status: TRANSACTION_STATUS.PENDING_HASH,
              userOpHash: mockUserOpHash,
              transactionHash: null,
            },
          ]);
      });

      it('Should not call FlowXO webhook if transaction hash is empty in tx PatchWallet endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub
            .getCalls()
            .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
        ).to.be.undefined;
      });
    });

    describe('Transaction hash is present in PatchWallet status endpoint', async function () {
      beforeEach(async function () {
        await collectionUsersMock.insertOne({
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          patchwallet: mockWallet,
          responsePath: mockResponsePath,
        });

        await collectionSwapsMock.insertOne({
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
          eventId: swapId,
          status: TRANSACTION_STATUS.PENDING_HASH,
          userOpHash: mockUserOpHash,
        });
      });

      it('Should return true if transaction hash is present in PatchWallet status endpoint', async function () {
        const result = await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(result).to.be.true;
      });

      it('Should not send tokens if transaction hash is present in PatchWallet status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
        ).to.be.undefined;
      });

      it('Should update the database with a success status if transaction hash is present in PatchWallet status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai
          .expect(await collectionSwapsMock.find({}).toArray())
          .excluding(['_id', 'dateAdded'])
          .to.deep.equal([
            {
              transactionHash: mockTransactionHash,
              chainId: DEFAULT_CHAIN_ID,
              userTelegramID: mockUserTelegramID,
              userName: mockUserName,
              userHandle: mockUserHandle,
              userWallet: mockWallet,
              tokenIn: mockTokenIn,
              amountIn: mockAmountIn,
              tokenOut: mockTokenOut,
              amountOut: mockAmountOut,
              priceImpact: mockPriceImpact,
              gas: mockGas,
              to: mockToSwap,
              from: mockFromSwap,
              tokenInSymbol: mockTokenInSymbol,
              tokenOutSymbol: mockTokenOutSymbol,
              eventId: swapId,
              userOpHash: mockUserOpHash,
              status: TRANSACTION_STATUS.SUCCESS,
            },
          ]);
      });

      it('Should call FlowXO webhook properly if transaction hash is present in PatchWallet status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });
        const FlowXOCallArgs = axiosStub
          .getCalls()
          .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK).args[1];

        chai.expect(FlowXOCallArgs).excluding(['dateAdded']).to.deep.equal({
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          userWallet: mockWallet,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
          transactionHash: mockTransactionHash,
          status: TRANSACTION_STATUS.SUCCESS,
        });

        chai
          .expect(FlowXOCallArgs.dateAdded)
          .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
        chai.expect(FlowXOCallArgs.dateAdded).to.be.lessThanOrEqual(new Date());
      });
    });

    describe('Transaction hash is not present in PatchWallet status endpoint', async function () {
      beforeEach(async function () {
        await collectionUsersMock.insertOne({
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          patchwallet: mockWallet,
          responsePath: mockResponsePath,
        });

        await collectionSwapsMock.insertOne({
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
          eventId: swapId,
          status: TRANSACTION_STATUS.PENDING_HASH,
          userOpHash: mockUserOpHash,
        });

        axiosStub.withArgs(PATCHWALLET_TX_STATUS_URL).resolves({
          data: {
            txHash: '',
            userOpHash: mockUserOpHash,
          },
        });
      });

      it('Should return false if transaction hash is not present in PatchWallet status endpoint', async function () {
        const result = await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(result).to.be.false;
      });

      it('Should not swap tokens if transaction hash is not present in PatchWallet status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
        ).to.be.undefined;
      });

      it('Should not update database if transaction hash is not present in PatchWallet status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai
          .expect(await collectionSwapsMock.find({}).toArray())
          .excluding(['_id', 'dateAdded'])
          .to.deep.equal([
            {
              chainId: DEFAULT_CHAIN_ID,
              userTelegramID: mockUserTelegramID,
              userName: mockUserName,
              userHandle: mockUserHandle,
              userWallet: mockWallet,
              tokenIn: mockTokenIn,
              amountIn: mockAmountIn,
              tokenOut: mockTokenOut,
              amountOut: mockAmountOut,
              priceImpact: mockPriceImpact,
              gas: mockGas,
              to: mockToSwap,
              from: mockFromSwap,
              tokenInSymbol: mockTokenInSymbol,
              tokenOutSymbol: mockTokenOutSymbol,
              eventId: swapId,
              status: TRANSACTION_STATUS.PENDING_HASH,
              userOpHash: mockUserOpHash,
              transactionHash: null,
            },
          ]);
      });

      it('Should not call FlowXO webhook if transaction hash is not present in PatchWallet status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub
            .getCalls()
            .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
        ).to.be.undefined;
      });
    });

    describe('Error in PatchWallet get status endpoint', async function () {
      beforeEach(async function () {
        await collectionUsersMock.insertOne({
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          patchwallet: mockWallet,
          responsePath: mockResponsePath,
        });

        await collectionSwapsMock.insertOne({
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
          eventId: swapId,
          status: TRANSACTION_STATUS.PENDING_HASH,
          userOpHash: mockUserOpHash,
        });

        axiosStub
          .withArgs(PATCHWALLET_TX_STATUS_URL)
          .rejects(new Error('Service not available'));
      });

      it('Should return false if Error in PatchWallet get status endpoint', async function () {
        const result = await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(result).to.be.false;
      });

      it('Should not send tokens if Error in PatchWallet get status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
        ).to.be.undefined;
      });

      it('Should not update database if Error in PatchWallet get status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai
          .expect(await collectionSwapsMock.find({}).toArray())
          .excluding(['_id', 'dateAdded'])
          .to.deep.equal([
            {
              chainId: DEFAULT_CHAIN_ID,
              userTelegramID: mockUserTelegramID,
              tokenIn: mockTokenIn,
              amountIn: mockAmountIn,
              tokenOut: mockTokenOut,
              amountOut: mockAmountOut,
              priceImpact: mockPriceImpact,
              gas: mockGas,
              to: mockToSwap,
              from: mockFromSwap,
              tokenInSymbol: mockTokenInSymbol,
              tokenOutSymbol: mockTokenOutSymbol,
              eventId: swapId,
              status: TRANSACTION_STATUS.PENDING_HASH,
              userOpHash: mockUserOpHash,
            },
          ]);
      });

      it('Should not call FlowXO webhook if Error in PatchWallet get status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub
            .getCalls()
            .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
        ).to.be.undefined;
      });
    });

    describe('Error 470 in PatchWallet get status endpoint', async function () {
      beforeEach(async function () {
        await collectionUsersMock.insertOne({
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          patchwallet: mockWallet,
          responsePath: mockResponsePath,
        });

        await collectionSwapsMock.insertOne({
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
          eventId: swapId,
          status: TRANSACTION_STATUS.PENDING_HASH,
          userOpHash: mockUserOpHash,
        });

        axiosStub.withArgs(PATCHWALLET_TX_STATUS_URL).rejects({
          response: {
            status: 470,
          },
        });
      });

      it('Should return true if Error 470 in PatchWallet get status endpoint', async function () {
        const result = await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(result).to.be.true;
      });

      it('Should not send tokens if Error 470 in PatchWallet get status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
        ).to.be.undefined;
      });

      it('Should update database with failure status if Error 470 in PatchWallet get status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai
          .expect(await collectionSwapsMock.find({}).toArray())
          .excluding(['_id', 'dateAdded'])
          .to.deep.equal([
            {
              chainId: DEFAULT_CHAIN_ID,
              userTelegramID: mockUserTelegramID,
              userName: mockUserName,
              userHandle: mockUserHandle,
              userWallet: mockWallet,
              tokenIn: mockTokenIn,
              amountIn: mockAmountIn,
              tokenOut: mockTokenOut,
              amountOut: mockAmountOut,
              priceImpact: mockPriceImpact,
              gas: mockGas,
              to: mockToSwap,
              from: mockFromSwap,
              tokenInSymbol: mockTokenInSymbol,
              tokenOutSymbol: mockTokenOutSymbol,
              eventId: swapId,
              status: TRANSACTION_STATUS.FAILURE,
              userOpHash: mockUserOpHash,
              transactionHash: null,
            },
          ]);
      });

      it('Should not call FlowXO webhook if Error 470 in PatchWallet get status endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub
            .getCalls()
            .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
        ).to.be.undefined;
      });
    });

    describe('Transaction is set to success without transaction hash if pending_hash without userOpHash', async function () {
      beforeEach(async function () {
        await collectionUsersMock.insertOne({
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          patchwallet: mockWallet,
          responsePath: mockResponsePath,
        });

        await collectionSwapsMock.insertOne({
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
          eventId: swapId,
          status: TRANSACTION_STATUS.PENDING_HASH,
        });
      });

      it('Should return true if transaction hash is pending_hash without userOpHash', async function () {
        const result = await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(result).to.be.true;
      });

      it('Should not send tokens if transaction hash is pending_hash without userOpHash', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
        ).to.be.undefined;
      });

      it('Should update reward database with a success status if transaction hash is pending_hash without userOpHash', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai
          .expect(await collectionSwapsMock.find({}).toArray())
          .excluding(['_id', 'dateAdded'])
          .to.deep.equal([
            {
              chainId: DEFAULT_CHAIN_ID,
              userTelegramID: mockUserTelegramID,
              userName: mockUserName,
              userHandle: mockUserHandle,
              userWallet: mockWallet,
              tokenIn: mockTokenIn,
              amountIn: mockAmountIn,
              tokenOut: mockTokenOut,
              amountOut: mockAmountOut,
              priceImpact: mockPriceImpact,
              gas: mockGas,
              to: mockToSwap,
              from: mockFromSwap,
              tokenInSymbol: mockTokenInSymbol,
              tokenOutSymbol: mockTokenOutSymbol,
              eventId: swapId,
              status: TRANSACTION_STATUS.SUCCESS,
              transactionHash: null,
              userOpHash: null,
            },
          ]);
      });

      it('Should not call FlowXO webhook if transaction hash is empty in tx PatchWallet endpoint', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub
            .getCalls()
            .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
        ).to.be.undefined;
      });
    });

    describe('Transaction is considered as failure after 10 min of trying to get status', async function () {
      beforeEach(async function () {
        await collectionUsersMock.insertOne({
          userTelegramID: mockUserTelegramID,
          userName: mockUserName,
          userHandle: mockUserHandle,
          patchwallet: mockWallet,
          responsePath: mockResponsePath,
        });

        await collectionSwapsMock.insertOne({
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
          eventId: swapId,
          status: TRANSACTION_STATUS.PENDING_HASH,
          dateAdded: new Date(Date.now() - 12 * 60 * 1000),
        });

        axiosStub.withArgs(PATCHWALLET_TX_STATUS_URL).resolves({
          data: {
            txHash: '',
            userOpHash: mockUserOpHash,
          },
        });
      });

      it('Should return true after 10 min of trying to get status', async function () {
        const result = await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(result).to.be.true;
      });

      it('Should not send tokens after 10 min of trying to get status', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub.getCalls().find((e) => e.firstArg === PATCHWALLET_TX_URL),
        ).to.be.undefined;
      });

      it('Should update reward database with a failure status after 10 min of trying to get status', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          to: mockToSwap,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai
          .expect(await collectionSwapsMock.find({}).toArray())
          .excluding(['_id', 'dateAdded'])
          .to.deep.equal([
            {
              chainId: DEFAULT_CHAIN_ID,
              userTelegramID: mockUserTelegramID,
              userName: mockUserName,
              userHandle: mockUserHandle,
              userWallet: mockWallet,
              tokenIn: mockTokenIn,
              amountIn: mockAmountIn,
              tokenOut: mockTokenOut,
              amountOut: mockAmountOut,
              priceImpact: mockPriceImpact,
              gas: mockGas,
              to: mockToSwap,
              from: mockFromSwap,
              tokenInSymbol: mockTokenInSymbol,
              tokenOutSymbol: mockTokenOutSymbol,
              eventId: swapId,
              status: TRANSACTION_STATUS.FAILURE,
              transactionHash: null,
              userOpHash: null,
            },
          ]);
      });

      it('Should not call FlowXO webhook after 10 min of trying to get status', async function () {
        await handleSwap({
          value: mockAmountIn,
          eventId: swapId,
          chainId: DEFAULT_CHAIN_ID,
          userTelegramID: mockUserTelegramID,
          tokenIn: mockTokenIn,
          amountIn: mockAmountIn,
          tokenOut: mockTokenOut,
          amountOut: mockAmountOut,
          priceImpact: mockPriceImpact,
          gas: mockGas,
          from: mockFromSwap,
          tokenInSymbol: mockTokenInSymbol,
          tokenOutSymbol: mockTokenOutSymbol,
        });

        chai.expect(
          axiosStub
            .getCalls()
            .find((e) => e.firstArg === FLOWXO_NEW_SWAP_WEBHOOK),
        ).to.be.undefined;
      });
    });
  });
});
