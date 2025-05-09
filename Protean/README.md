# FMPS User Registration Script

This Node.js script reads user data from a CSV file and registers each user through the FMPS API. It supports concurrent API requests with rate limiting and outputs a new CSV with API responses.

## Features

- Reads user data from a CSV file.
- Supports both standard and SSO user creation.
- Sends user creation requests to FMPS API.
- Writes results to a timestamped output CSV file.
- Limits concurrent API requests to avoid overloading the server.

## Prerequisites

- Node.js >= 12
- Valid FMPS API tokens (Bearer token and x-authenticated-user-token)

## Setup

1. Clone or download the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Place your input CSV file at:

   ```
   ./test-script/FMPS_Users_Data_Sheet2.csv
   ```

4. Replace the hardcoded authentication tokens in the script with your actual values. **(Security Warning: Do NOT commit sensitive tokens to version control.)**

## Usage

Uncomment the last line of the script to execute the function:

```javascript
runUserCreationScript();
```

Then run the script:

```bash
node your-script-file.js
```

Upon completion, the script will create an output CSV file in the root directory:

```
FMPS_Registered_Users-<timestamp>.csv
```

## Configuration

- `inputFilePath`: Path to the input CSV file.
- `outputFilePath`: Generated dynamically with a timestamp.
- `API_BASE_URL`: Base URL for the FMPS API.
- `pLimit`: Limits concurrent API requests (currently set to 5).

## Sample CSV Columns

Make sure your CSV includes the following headers:

- `user_name`
- `first_name`
- `last_name`
- `email`
- `cin`
- `fmps_id`
- `training_profile`
- `province`
- `Category`

## Notes

- The script currently uses **SSO user creation** (`/api/user/v1/sso/create`).
- To use the non-SSO endpoint (`/api/user/v1/create`), update the `callApi()` logic accordingly.

## License

This project is private and intended for internal use only.

---

**Security Reminder:** Remove or obfuscate sensitive tokens before sharing or deploying this code publicly.
