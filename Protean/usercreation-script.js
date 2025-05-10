const fs = require("fs");
const csv = require("csv-parser");
const axios = require("axios");
const { parse } = require("json2csv");
const pLimit = require("p-limit");

const inputFilePath = "./test-script/FMPS_Users_Data_Sheet2.csv";
const outputFilePath = `./FMPS_Registered_Users-${Date.now()}.csv`;

const API_BASE_URL = "https://dev-fmps.sunbirded.org";

const results = [];

const headers = {
  "Content-Type": "application/json",
  Authorization:
    "",
  "x-authenticated-user-token":
    "",
};

function buildPayload(user, isSSO) {
  const profileConfig = JSON.stringify({
    cin: user["cin"] || "",
    idFmps: user["fmps_id"] || "",
    trainingGroup: user["training_profile"] || "",
    province: user["province"] || "",
    category: user["Category"] || "",
  });

  console.log(user);

  const payload = {
    request: {
      userName: user["user_name"],
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      language: ["Arabic", "English", "French"],
      framework_languages: ["Arabic", "English", "French"],
      cin: user["cin"] || "",
      fmps_id: user["fmps_id"] || "",
      training_profile: user["training_profile"] || "",
      province: user["province"] || "",

      framework: {
        category: [],
        id: ["FMPS"],
        organisation: [user.frameworkOrganisation || "FMPS"],
        profileConfig: [profileConfig],
      },

      //status: user.status,
      emailVerified: true,
      //channel: user.channel,
      roles: ["PUBLIC"],
    },
  };

  if (!isSSO) {
    payload.request.password = "Fmps@1234";
  }

  return payload;
}

function callApi(user, isSSO) {
  const url = isSSO
    ? `${API_BASE_URL}/api/user/v1/sso/create`
    : `${API_BASE_URL}/api/user/v1/create`;
  const payload = buildPayload(user, isSSO);
  console.log({ url, payload });
  console.log(JSON.stringify(payload, null, 2));

  return axios.post(url, payload, { headers });
}

function runUserCreationScript() {
  fs.createReadStream(inputFilePath)
    .pipe(csv())
    .on("data", (data) => {
      // Trim all keys in each row
      const trimmedData = {};
      for (let key in data) {
        trimmedData[key.trim()] = data[key].trim?.() ?? data[key]; // Also trim values if string
      }
      results.push(trimmedData);
    })
    .on("end", async () => {
        const limit = pLimit(5); // Max 5 concurrent requests
        const tasks = results.map((user, index) =>
          limit(async () => {
            const userId = await callApi(user, true);
            results[index].userId = userId;
            console.log(`User ${user.user_name} => ${userId}`);
          })
        );
  
        await Promise.all(tasks);
  
        const updatedCsv = parse(results);
        fs.writeFileSync(outputFilePath, updatedCsv);
        console.log("✅ All users processed. CSV written to:", outputFilePath);
      });
  }

// runUserCreationScript();

module.exports = runUserCreationScript;
