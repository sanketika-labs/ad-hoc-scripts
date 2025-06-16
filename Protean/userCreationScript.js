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
//const API_BASE_URL = "https://dev-fmps.sunbirded.org/";
const API_BASE_URL = "https://maharat.fmps.ma/";

const results = [];

// const headers = {
//   "Content-Type": "application/json",
//   Authorization: `Bearer ${process.env.API_TOKEN}`,
//   "x-authenticated-user-token": process.env.USER_TOKEN,
// };

const headers = {
    "Content-Type": "application/json",
  //  Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.-qfZEwBAoHFhxNqhGq7Vy_SNVcwB1AtMX8xbiVHF5FQ",
  //  "x-authenticated-user-token": "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJiNHo2d3JudWdZeHNhSTR0VUdJcWtFUERJNkMxTkh0a1pCeHVQYzY2R1VRIn0.eyJqdGkiOiI0NWEyOTcxMi0yMWZmLTRmMWEtYjE0ZC00NmIwZWNiNWM2MjIiLCJleHAiOjE3NDU5NDc3MDEsIm5iZiI6MCwiaWF0IjoxNzQ1OTA0NTAxLCJpc3MiOiJodHRwczovL2Rldi1mbXBzLnN1bmJpcmRlZC5vcmcvYXV0aC9yZWFsbXMvc3VuYmlyZCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJmOmNhc3NhbmRyYWZlZGVyYXRpb25pZDo2NWMxOThmOC1kNzU5LTRiZjYtOTEwNS01Njk3YTJiYjZjNjUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJkaXJlY3QtZ3JhbnQiLCJhdXRoX3RpbWUiOjAsInNlc3Npb25fc3RhdGUiOiJhMzliZTUxNS1kZjJhLTQyMzctYjdhYy01MDI4MjJjMWIzNGEiLCJhY3IiOiIxIiwiYWxsb3dlZC1vcmlnaW5zIjpbImh0dHBzOi8vZGV2LWZtcHMuc3VuYmlyZGVkLm9yZyJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoiZW1haWwgcHJvZmlsZSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwibmFtZSI6IkFkbWluIEZNUFMiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJhZG1pbi1mbXBzIiwiZ2l2ZW5fbmFtZSI6IkFkbWluIiwiZmFtaWx5X25hbWUiOiJGTVBTIiwiZW1haWwiOiJhZCoqKioqKioqQHlvcG1haWwuY29tIn0.acJjru-CS1XPmIyIMoXM2_UnJofrWhdgAB6ofS6pr84K7565zeHUb05qsu0B4DKNfFhytmc1f9hR6-J3tGOOG3T16UHhU7aHMhUOhpFQkAEnXij8XlIyBdQ9CPpen8cgnV7G9BEhPeVgWa_10UkZry01YRgsaEt5i332wgFcNWmtFpnU99AXIMGf51dP8BDgzDWZNqAV97vhn3TPQRJHVcK0lEQj-tJE3q4Wvct34a8IL_VSaciRMxpI-i-SQc8uKQAbiZFDMG34_68VZOq-gw1A5ZWloeAdTboS_5qySec7k-X3E_jUqI9VAKMpicuH_NitNrF0obmrJCiwvuDY7A",
  Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.29h7_XRriDhgKQHWBV4aP49kv0yI6K1yxUCPDreWoEE",
  "x-authenticated-user-token": "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJMaEc0M3lGdmNHRm5NVVFyZXVmdlBvUHMzQzZDem1lZ1RJNkctTmF1YmZnIn0.eyJqdGkiOiIxYzhjNDE4NC03ODFiLTRhMzktOGJjYi1lMjNhNDc5MDM5MTQiLCJleHAiOjE3NDc4NjQyOTIsIm5iZiI6MCwiaWF0IjoxNzQ3ODIxMDkyLCJpc3MiOiJodHRwczovL21haGFyYXQuZm1wcy5tYS9hdXRoL3JlYWxtcy9zdW5iaXJkIiwiYXVkIjoiYWNjb3VudCIsInN1YiI6ImY6Y2Fzc2FuZHJhZmVkZXJhdGlvbmlkOmQzYmNhYjk4LWQ1YjMtNDkwMC05MWU4LWJlOTJiODA4MTcxNCIsInR5cCI6IkJlYXJlciIsImF6cCI6ImRpcmVjdC1ncmFudCIsImF1dGhfdGltZSI6MCwic2Vzc2lvbl9zdGF0ZSI6IjkyMjk4NTU1LTQ3MDUtNGE1OS04NmMzLTg3ZmEyNTg5ZGU2NyIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiaHR0cHM6Ly9tYWhhcmF0LmZtcHMubWEiXSwicmVhbG1fYWNjZXNzIjp7InJvbGVzIjpbIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbIm1hbmFnZS1hY2NvdW50IiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2aWV3LXByb2ZpbGUiXX19LCJzY29wZSI6ImVtYWlsIHByb2ZpbGUiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsIm5hbWUiOiJBZG1pbiIsInByZWZlcnJlZF91c2VybmFtZSI6ImFkbWluIiwiZ2l2ZW5fbmFtZSI6IkFkbWluIiwiZmFtaWx5X25hbWUiOiIiLCJlbWFpbCI6ImFkKioqQHlvcG1haWwuY29tIn0.tKmISShLTrpVPZLe1hddZX6fgBMbV-Fr4Udw8pT3SWWJ6mmAaOlfDTV-uyeRo76pCsvrvfucga3LBiizA11PVM7XENqo9nKkFTxWfUqwF6DJ0LyATtrxQ1ODOOoVDmBKEQTNaRCE4G8pFzUKOSWjBEKmOB1dFj2XaJZlRw6WImqzdg7TuH9MMeuv8ZJeUlw4lPEilvMO96IPdivon2yrJAAanLbCeb_LxM-z0ysDAmVQSNQL87g1KJEDuoQuTTkwJEVJSNXoTnCTvqgUBOxXaU-7uqZra0OMalAEFq83kjntZyTs12TBhrJPhJlf-ZyPNqoQPT0zfYSWrCyLLff_Ww",
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
  });

  return {
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

        console.log(`🚶‍♂️ Processing user: ${user.user_name || user.email}...`);
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