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
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.-qfZEwBAoHFhxNqhGq7Vy_SNVcwB1AtMX8xbiVHF5FQ",
  "x-authenticated-user-token":
    "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJiNHo2d3JudWdZeHNhSTR0VUdJcWtFUERJNkMxTkh0a1pCeHVQYzY2R1VRIn0.eyJqdGkiOiI0NWEyOTcxMi0yMWZmLTRmMWEtYjE0ZC00NmIwZWNiNWM2MjIiLCJleHAiOjE3NDU5NDc3MDEsIm5iZiI6MCwiaWF0IjoxNzQ1OTA0NTAxLCJpc3MiOiJodHRwczovL2Rldi1mbXBzLnN1bmJpcmRlZC5vcmcvYXV0aC9yZWFsbXMvc3VuYmlyZCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJmOmNhc3NhbmRyYWZlZGVyYXRpb25pZDo2NWMxOThmOC1kNzU5LTRiZjYtOTEwNS01Njk3YTJiYjZjNjUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJkaXJlY3QtZ3JhbnQiLCJhdXRoX3RpbWUiOjAsInNlc3Npb25fc3RhdGUiOiJhMzliZTUxNS1kZjJhLTQyMzctYjdhYy01MDI4MjJjMWIzNGEiLCJhY3IiOiIxIiwiYWxsb3dlZC1vcmlnaW5zIjpbImh0dHBzOi8vZGV2LWZtcHMuc3VuYmlyZGVkLm9yZyJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoiZW1haWwgcHJvZmlsZSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwibmFtZSI6IkFkbWluIEZNUFMiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJhZG1pbi1mbXBzIiwiZ2l2ZW5fbmFtZSI6IkFkbWluIiwiZmFtaWx5X25hbWUiOiJGTVBTIiwiZW1haWwiOiJhZCoqKioqKioqQHlvcG1haWwuY29tIn0.acJjru-CS1XPmIyIMoXM2_UnJofrWhdgAB6ofS6pr84K7565zeHUb05qsu0B4DKNfFhytmc1f9hR6-J3tGOOG3T16UHhU7aHMhUOhpFQkAEnXij8XlIyBdQ9CPpen8cgnV7G9BEhPeVgWa_10UkZry01YRgsaEt5i332wgFcNWmtFpnU99AXIMGf51dP8BDgzDWZNqAV97vhn3TPQRJHVcK0lEQj-tJE3q4Wvct34a8IL_VSaciRMxpI-i-SQc8uKQAbiZFDMG34_68VZOq-gw1A5ZWloeAdTboS_5qySec7k-X3E_jUqI9VAKMpicuH_NitNrF0obmrJCiwvuDY7A",
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
