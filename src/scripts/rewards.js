import { Database } from "../db/conn.js";
import fs from "fs";
import csv from "csv-parser";
import web3 from "web3";
import { REWARDS_COLLECTION, USERS_COLLECTION } from "../utils/constants.js";

// Usage: startImport(filePath)
// Description: This function imports rewards data from a CSV file into the database.
// - filePath: The path to the CSV file containing rewards data.
// Example: startImport("/path/to/your/file.csv");
const startImport = (fileName) => {
  const rewards = [];
  fs.createReadStream(fileName)
    .pipe(csv())
    .on("data", (row) => {
      rewards.push(row);
    })
    .on("end", async () => {
      await saveRewards(rewards);
      console.log("\n All data has been read \n");
      process.exit(0);
    })
    .on("error", (error) => {
      console.log("\n Errors during CSV parsing \n");
      process.exit(1);
    });
};

async function saveRewards(rewards) {
  const db = await Database.getInstance();
  const collection = db.collection("rewards-test");

  // Step 1: Create a set of existing rewards hashes
  const existingHashes = await collection.distinct("transactionHash");

  // Step 2: Filter the rewards to find the missing ones and format them
  const formattedMissingRewards = rewards
    .filter((reward) => {
      // Exclude rewards with amounts other than 100 or 50
      const amount = Number(reward.value) / 1e18;
      return (
        (amount === 100 || amount === 50) &&
        !existingHashes.includes(reward.evt_tx_hash)
      );
    })
    .map((rewards) => {
      const amount = String(Number(rewards.value) / 1e18);
      const message = generateRewardMessage(amount, rewards.evt_block_time);
      return {
        userTelegramID: "",
        responsePath: "",
        walletAddress: web3.utils.toChecksumAddress(rewards.to),
        reason: message.reason,
        userHandle: "",
        userName: "",
        amount: amount,
        message: message.description,
        transactionHash: rewards.evt_tx_hash,
        dateAdded: new Date(rewards.evt_block_time),
      };
    });

  // Step 3: Extract all walletAddress values from formattedMissingRewards
  const walletAddresses = formattedMissingRewards.map(
    (reward) => reward.walletAddress
  );

  // Step 4: Filter the users collection to match walletAddress values
  const userData = await db
    .collection(USERS_COLLECTION)
    .find({ patchwallet: { $in: walletAddresses } })
    .toArray();

  // Step 5: Loop through each formatted missing reward and fill user data
  formattedMissingRewards.forEach((reward) => {
    const matchingUser = userData.find(
      (user) => user.patchwallet === reward.walletAddress
    );

    if (matchingUser) {
      reward.userTelegramID = matchingUser.userTelegramID;
      reward.responsePath = matchingUser.responsePath;
      reward.userHandle = matchingUser.userHandle;
      reward.userName = matchingUser.userName;
    }
  });

  // Step 6: Batch insert the missing rewards into the collection if needed
  const batchSize = 10000;
  for (let i = 0; i < formattedMissingRewards.length; i += batchSize) {
    const batch = formattedMissingRewards.slice(i, i + batchSize);
    await collection.insertMany(batch);
    console.log("Batch: ", i);
  }
}

const generateRewardMessage = (amount, blockTime) => {
  const transitionDate = new Date("2023-09-05T12:00:00Z");
  const dateObj = new Date(blockTime);
  const isBeforeTuesdayNoon = dateObj < transitionDate;

  if (amount === "100") {
    return {
      reason: "user_sign_up",
      description: "Sign up reward",
    };
  } else if (amount === "50" && isBeforeTuesdayNoon) {
    return {
      reason: "hunt",
      description: "Product Hunt reward",
    };
  } else if (amount === "50" && !isBeforeTuesdayNoon) {
    return {
      reason: "2x_reward",
      description: "2x Referral reward",
    };
  } else {
    return {
      reason: undefined,
      description: undefined,
    };
  }
};

async function updateRewardMessages() {
  const db = await Database.getInstance();
  const collection = db.collection(REWARDS_COLLECTION);

  const rewards = await collection.find({}).toArray();
  const totalRewards = rewards.length;

  const bulkUpdateOperations = [];

  let processedCount = 0;

  for (const reward of rewards) {
    let updatedMessage = "";

    if (reward.amount === "100") {
      updatedMessage = "Sign up reward";
    } else if (
      reward.amount === "50" &&
      reward.message.includes("Product Hunt")
    ) {
      updatedMessage = "Product Hunt reward";
    } else if (
      reward.amount === "50" &&
      !reward.message.includes("Product Hunt")
    ) {
      updatedMessage = "Referral reward";
    } else {
      updatedMessage = "2x Referral reward";
    }

    if (updatedMessage) {
      bulkUpdateOperations.push({
        updateOne: {
          filter: { _id: reward._id },
          update: { $set: { message: updatedMessage } },
        },
      });

      processedCount++;
      console.log(
        `[${processedCount}/${totalRewards}]: Message updated for ${reward.userTelegramID}`
      );
    }
  }

  if (bulkUpdateOperations.length > 0) {
    await collection.bulkWrite(bulkUpdateOperations);
  }

  console.log("\n All rewards have been updated \n");
  process.exit(0);
}
