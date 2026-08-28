import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as fs from "fs";

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: "school-dummy",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });

  const db = testEnv.authenticatedContext("rahulsah4534", {
    email: "rahulsah4534@gmail.com",
    email_verified: true,
  }).firestore();

  try {
    await db.collection("exams").doc("First_Term_1").set({ foo: "bar" }, { merge: true });
    console.log("SUCCESS!");
  } catch (e: any) {
    console.error("FAILED:", e.message);
  }

  await testEnv.cleanup();
}

run();
