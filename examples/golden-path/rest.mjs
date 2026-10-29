// Reads only the caller's explicitly configured Passport. Never prints secrets.
const key = process.env.TASTEPOLICY_API_KEY,
  passportRef = process.env.TASTEPOLICY_PASSPORT_REF;
if (!key || !passportRef)
  throw new Error("Configure private credential and Passport reference.");
const response = await fetch("https://tastepolicy.vercel.app/api/v1/passport", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ passportRef }),
  redirect: "error",
  signal: AbortSignal.timeout(45000),
});
const body = await response.json();
if (!response.ok) throw new Error(body.code || "REQUEST_FAILED");
console.log(
  JSON.stringify({
    schemaVersion: body.data.schemaVersion,
    stateVersion: body.data.stateVersion,
  }),
);
