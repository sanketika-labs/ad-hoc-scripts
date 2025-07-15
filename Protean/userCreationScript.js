//require("dotenv").config(); // Load environment variables

const fs = require("fs");
const csv = require("csv-parser");
const axios = require("axios");
const { parse } = require("json2csv");

const inputFilePath = "./list supervisor - SEP SECOND BATCH.csv";

const getFormattedTimestamp = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(
    now.getMinutes()
  ).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
};

const outputFilePath = `./Prod_Imported_Users_Report-${getFormattedTimestamp()}.csv`;
const API_BASE_URL = "<<host>>";
const API_TOKEN = "<<api-key>>";
const USER_TOKEN = "<<user-token>>";

const results = [];

// const headers = {
//   "Content-Type": "application/json",
//   Authorization: `Bearer ${process.env.API_TOKEN}`,
//   "x-authenticated-user-token": process.env.USER_TOKEN,
// };

const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_TOKEN}`,
    "x-authenticated-user-token": USER_TOKEN,
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Construct the payload based on user data
function buildPayload(user, isSSO) {
  const profileConfig = JSON.stringify({
    cin: user["cin"] || "",
    idFmps: user["fmps_id"] || "",
    trainingGroup: user["training_profile"] || "",
    province: user["province"] || "",
    category: user["Category"] || "",
    designation: user["designation"] || "",
  });

  return {
    request: {
      userName: user["user_name"],
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      language: ["Arabic", "English", "French"],
      //framework_languages: ["Arabic", "English", "French"],
      cin: user["cin"] || "",
      fmps_id: user["fmps_id"] || "",
      training_profile: user["training_profile"] || "",
      province: user["province"] || "",
      framework: {
        language: ["Arabic", "English", "French"],
        category: [],
        id: ["FMPS"],
        organisation: [user.frameworkOrganisation || "FMPS"],
        profileConfig: [profileConfig],
      },
      emailVerified: true,
      roles: ["PUBLIC"],
      ...(isSSO ? {} : { password: "Fmps@1234" }),
    },
  };
}

// Call the API and handle response/errors
async function callApi(user, isSSO) {
  const url = isSSO
    ? `${API_BASE_URL}/api/user/v1/sso/create`
    : `${API_BASE_URL}/api/user/v1/create`;
  const payload = buildPayload(user, isSSO);

  try {
    const response = await axios.post(url, payload, { headers });
    return { success: true, userId: response.data.result?.userId || "N/A" };
  } catch (error) {
    const msg = error.response?.data?.params?.errmsg || error.message;
    const status = error.response?.status || "N/A";
    return { success: false, error: `${msg} (HTTP ${status})` };
  }
}

// Main function
async function runUserCreationScript() {
  console.log("🚀 Starting user import...");

  fs.createReadStream(inputFilePath)
    .pipe(csv())
    .on("data", (data) => {
      const trimmedData = {};
      for (let key in data) {
        trimmedData[key.trim()] = data[key].trim?.() ?? data[key];
      }
      results.push(trimmedData);
    })
    .on("end", async () => {
      console.log(`📦 Total users loaded: ${results.length}\n`);
      
      let successCount = 0;
      let failureCount = 0;
      const failureDetails = [];

      for (const [index, user] of results.entries()) {
        const isSSO = true;

        // Skip users with missing essential fields
        if (!user["user_name"] || !user["email"]) {
          user.status = "Skipped";
          user.error = "Missing required user_name or email";
          failureCount++;
          failureDetails.push(user);
          continue;
        }

        console.log(`🚶‍♂️ Processing user(${index + 1}/${results.length}): ${user.user_name || user.email}...`);
        const result = await callApi(user, isSSO);

        if (result.success) {
          user.status = "Success";
          user.userId = result.userId;
          successCount++;
          console.log(`✔️  User ${user.user_name} created successfully!`);
        } else {
          user.status = "Failed";
          user.error = result.error;
          failureCount++;
          console.log(`❌  User ${user.user_name} failed: ${result.error}`);
        }

        // Log progress every 100 users
        if ((index + 1) % 100 === 0 || index === results.length - 1) {
          console.log(`📊 Progress: ${index + 1} out of ${results.length} users processed`);
        }

        // Delay to prevent hitting the API rate limit
        await delay(200);
      }

      // Save output report
      const updatedCsv = parse(results);
      fs.writeFileSync(outputFilePath, updatedCsv);
      console.log(`\n✅ Output file saved: ${outputFilePath}`);
      
      // Output the summary of results
      console.log(`\n📊 Summary:`);
      console.log(`✅ ${successCount} users succeeded`);
      console.log(`❌ ${failureCount} users failed`);
      if (failureCount > 0) {
        console.log(`🔴 Users that failed: ${failureDetails.length}`);
        failureDetails.forEach(failure => {
          console.log(`User: ${failure.user_name || failure.email} failed with error: ${failure.error}`);
        });
      }
    });
}

module.exports = { runUserCreationScript };

// Call the function if run directly
if (require.main === module) {
  runUserCreationScript();
}
