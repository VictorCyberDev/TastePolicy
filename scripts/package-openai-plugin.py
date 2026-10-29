"""Package public source assets only; never credentials or generated review data."""
import json
import pathlib
import zipfile
import hashlib

root = pathlib.Path("distribution/openai")
manifest = json.loads((root / "plugin.json").read_text())
mcp = json.loads((root / "mcp.json").read_text())
review = manifest["extensions"]["com.openai"]["review"]
assert len(review["test_cases"]["positive"]) == 5
assert len(review["test_cases"]["negative"]) == 3
assert set(mcp["mcpServers"]) == {"tastepolicy"}
server = mcp["mcpServers"]["tastepolicy"]
assert server["url"] == "https://tastepolicy.vercel.app/api/mcp"
assert "headers" not in server
assert server["extensions"]["com.openai"]["auth"]["client"] == {"mode": "cimd"}
assert "clientSecret" not in json.dumps(mcp)
interface = manifest["extensions"]["com.openai"]["interface"]
assert len(interface["displayName"]) <= 30
assert len(interface["shortDescription"]) <= 30
assert len(interface["longDescription"]) <= 4000
for key in ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]:
    assert interface[key].startswith("https://tastepolicy.vercel.app")
for key in ["logo", "composerIcon"]:
    relative = pathlib.PurePosixPath(interface[key])
    assert ".." not in relative.parts
    assert (root / relative).is_file()
contract = pathlib.Path("src/lib/platform/contracts.ts").read_text()
for case in review["test_cases"]["positive"]:
    for name in case["tools_triggered"].split(", "):
        assert 'name: "' + name + '"' in contract
output = pathlib.Path(".work-evidence/tastepolicy-openai-plugin-DRAFT-0.2.0.zip")
output.parent.mkdir(exist_ok=True)
# Explicit allowlist excludes README, evidence, future private review fixtures.
files = ["plugin.json", "mcp.json", "LICENSE", "assets/logo.png"]
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
print(json.dumps({"status": "DRAFT_PACKAGE_NOT_SUBMITTED", "output": str(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "files": files, "positive": 5, "negative": 3, "remaining": ["identity/domain verification", "real OAuth/tool scan", "private reviewer account", "eight actual host case runs", "demo recording", "portal findings/attestations/review"]}))
