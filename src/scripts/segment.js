import {Database} from "../db/conn.js";
import axios from "axios";

const SEGMENT_API_ENDPOINT = "https://api.segment.io/v1/batch";
const SEGMENT_WRITE_KEY = process.env.SEGMENT_WRITE_KEY;

// Usage: sendUsersBatchRequest()
// Description: Sends a batch request to the Segment API with user details.
// This function fetches all users from the database, formats the user data according to the Segment API requirements,
// and sends a batch request to the Segment API. The batch payload includes identification details,
// user traits such as userName, userHandle, responsePath, and patchwallet, and the timestamp of when the user was added.
// Example: sendUsersBatchRequest();
async function sendUsersBatchRequest() {
  const db = await Database.getInstance();
  const usersCollection = db.collection("users");

  try {
    const users = await usersCollection.find().toArray();

    const batch = users.map((user) => ({
      type: "identify",
      userId: user.userTelegramID,
      traits: {
        userName: user.userName,
        userHandle: user.userHandle,
        responsePath: user.responsePath,
        patchwallet: user.patchwallet,
      },
      timestamp: user.dateAdded,
    }));

    const payload = {
      batch: batch,
    };

    const config = {
      headers: {
        Authorization: `Bearer ${SEGMENT_WRITE_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const response = await axios.post(SEGMENT_API_ENDPOINT, payload, config);
    console.log("Data sent successfully:", response.data);
  } catch (error) {
    console.log(error);
    console.error(
      "Error sending batch request:",
      error.response ? error.response.data : error.message
    );
  } finally {
    process.exit(0);
  }
}

// Usage: sendTransfersBatchRequest()
// Description: Sends a batch request to the Segment API with transfer details.
// This function fetches all transfer records from the database, formats the transfer data according to the
// Segment API requirements, and sends a batch request to the Segment API. The batch payload includes event details,
// transaction properties like Amount, TxId, sender and recipient details, token details, and the timestamp of the transfer.
// Example: sendTransfersBatchRequest();
async function sendTransfersBatchRequest() {
  const db = await Database.getInstance();
  const transfersCollection = db.collection("transfers");

  try {
    const transfers = await transfersCollection.find().toArray();

    const batch = transfers.map((transfer) => ({
      type: "track",
      userId: transfer.senderTgId,
      event: "Transfer",
      properties: {
        Amount: transfer.tokenAmount,
        TxId: transfer.TxId,
        chainId: transfer.chainId,
        recipientTgId: transfer.recipientTgId,
        recipientWallet: transfer.recipientWallet,
        senderName: transfer.senderName,
        senderTgId: transfer.senderTgId,
        senderWallet: transfer.senderWallet,
        tokenAddress: transfer.tokenAddress,
        tokenAmount: transfer.tokenAmount,
        tokenSymbol: transfer.tokenSymbol,
        transactionHash: transfer.transactionHash,
      },
      timestamp: transfer.dateAdded,
    }));

    const payload = {
      batch: batch,
    };

    const config = {
      headers: {
        Authorization: `Bearer ${SEGMENT_WRITE_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const response = await axios.post(SEGMENT_API_ENDPOINT, payload, config);
    console.log("Data sent successfully:", response.data);
  } catch (error) {
    console.error(
      "Error sending batch request:",
      error.response ? error.response.data : error.message
    );
  } finally {
    process.exit(0);
  }
}
