import { test, expect as baseExpect, type Page } from "@playwright/test";
import { mockExperience } from "./experience-fixture";
import { fakeAccount, mockAccount } from "./account-fixture";

const expect = baseExpect.configure({ timeout: 20000 });
test.setTimeout(120000);

// None of the real-user surfaces may ever show the example person.
async function noMargaret(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Margaret/i);
}

test("P0: a brand-new person signs up, sets up their taste, and uses their own data", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fake = fakeAccount();
  await mockExperience(page, { facts: [] });
  await mockAccount(page, fake);

  // 1. Signup lands on onboarding, not on someone else's example.
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Sam");
  await page.getByLabel("Email").fill("sam@example.test");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await noMargaret(page);

  // 2. Onboarding: five things in their own words, confirmed, saved.
  await page.getByRole("button", { name: "Start" }).click();
  const words = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
  for (let i = 0; i < 5; i++)
    await page.getByLabel(`Favourite ${i + 1}`).fill(`${words[i]} words`);
  await page.getByRole("button", { name: "Find them" }).click();
  await expect(
    page.getByRole("heading", { name: /exactly the ones you mean/ }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /These are the five I mean/ })
    .check();
  await page.getByRole("button", { name: "Save my taste" }).click();
  await expect(
    page.getByRole("heading", { name: /What matters when you go out/ }),
  ).toBeVisible();
  expect(fake.passport?.anchors).toHaveLength(5);

  // 3. What matters, then how far AI may go.
  await page.getByRole("checkbox", { name: /step-free entrance/i }).check();
  await page.getByRole("checkbox", { name: /short walk/i }).check();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: /How far may an AI helper go/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Your taste is ready." }),
  ).toBeVisible();
  expect(fake.passport?.ceiling).toBe("SHORTLIST");
  expect(fake.passport?.needs.requirements.map((r) => r.key)).toEqual([
    "accessible_entrance",
    "walking_minutes",
  ]);
  await noMargaret(page);

  // 4. The experience is theirs: their anchors, their needs, their ceiling.
  await page
    .getByRole("link", { name: /Find somewhere that feels like you/ })
    .click();
  await expect(page).toHaveURL(/\/experience$/);
  await expect(
    page.getByRole("heading", { name: "Find somewhere that feels like you." }),
  ).toBeVisible();
  await expect(page.getByText("Step-free entrance").first()).toBeVisible();
  await expect(
    page.getByText(fake.passport!.anchors[0].name).first(),
  ).toBeVisible();
  await noMargaret(page);
  await page
    .getByRole("button", { name: /Find somewhere that feels like me/ })
    .click();
  await page
    .getByRole("button", { name: /Check it against what matters to you/ })
    .click();
  await expect.poll(() => fake.evaluations.length).toBe(1);
  await expect(page.getByText(/Evaluation .* state v1/)).toBeAttached();
  await expect(
    page.getByText(/Go ahead|Needs your answer|Not this one/).first(),
  ).toBeVisible();
  // The person's own page speaks to them, never about an example person.
  await expect(page.locator("main")).not.toContainText(/\b(her|she)\b/i);
  const choose = fake.calls.filter((c) => c.op === "choose").at(-1)!;
  expect(choose.body.passportRef).toBe("tpp_synthetic_new");
  const ctx = (
    choose.body.proposal as { context: { requirements: { key: string }[] } }
  ).context;
  expect(ctx.requirements.map((r) => r.key)).toEqual([
    "accessible_entrance",
    "walking_minutes",
  ]);
  await noMargaret(page);

  // 5. It persists: a fresh load of the dashboard shows the saved data.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your taste" })).toBeVisible();
  for (const a of fake.passport!.anchors)
    await expect(page.getByText(a.name).first()).toBeVisible();
  await expect(page.getByText("Step-free entrance")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How far AI may go" }),
  ).toBeVisible();
  await noMargaret(page);
  // No infrastructure vocabulary leaks into the person's own pages.
  await expect(page.locator("main")).not.toContainText(
    /Passport|passportRef|stateVersion|idempotency|lease|ceiling|ASK\b|tpp_/i,
  );
  expect(errors).toEqual([]);
});

test("a signed-in account without a Passport is guided to onboarding, never an example", async ({
  page,
}) => {
  const fake = fakeAccount({ signedIn: false });
  await mockExperience(page);
  await mockAccount(page, fake);

  // Login with an account that never finished setup goes to onboarding.
  await page.goto("/login");
  await page.getByLabel("Email").fill("lapsed@example.test");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // The dashboard and the experience point at setup instead of inventing data.
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /set up your taste/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Set up my taste" }),
  ).toBeVisible();
  await noMargaret(page);
  await page.goto("/experience");
  await expect(
    page.getByRole("heading", { name: /set up your taste first/i }),
  ).toBeVisible();
  await noMargaret(page);
});

test("a returning account with a Passport goes home and sees its own data", async ({
  page,
}) => {
  const fake = fakeAccount({ signedIn: false, withPassport: true });
  await mockExperience(page);
  await mockAccount(page, fake);
  await page.goto("/login");
  await page.getByLabel("Email").fill("back@example.test");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText(fake.passport!.anchors[0].name).first(),
  ).toBeVisible();
  await noMargaret(page);

  // Editing what matters saves to the account and survives a reload.
  await page.getByRole("button", { name: "Change what matters" }).click();
  await page.getByRole("checkbox", { name: /quieter room/i }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("A quieter room")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("A quieter room")).toBeVisible();
  expect(fake.passport?.needs.requirements.map((r) => r.key)).toEqual([
    "noise_level",
  ]);

  // Signing out returns to a visitor, with no leftover personal data.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Sign in to open your home." }),
  ).toBeVisible();
  await expect(page.getByText(fake.passport!.anchors[0].name)).toHaveCount(0);
});

test("a visitor is asked to sign in on the personal experience; the example stays on its own page", async ({
  page,
}) => {
  const fake = fakeAccount();
  await mockExperience(page);
  await mockAccount(page, fake);
  await page.goto("/experience");
  await expect(
    page.getByRole("heading", { name: /Sign in to find places for you/ }),
  ).toBeVisible();
  await noMargaret(page);
  await page.getByRole("link", { name: "See an example" }).click();
  await expect(page).toHaveURL(/\/demo\/margaret$/);
  await expect(
    page.getByRole("heading", { name: "Meet Margaret." }),
  ).toBeVisible();
});

test("a late account response never pulls someone back a step during onboarding", async ({
  page,
}) => {
  const fake = fakeAccount({ signedIn: true });
  await mockExperience(page);
  await mockAccount(page, fake);
  // Later routes win: slow every read of the saved taste, then fall through.
  await page.route("**/api/account/taste", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.fallback();
  });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Start" }).click();
  const words = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
  for (let i = 0; i < 5; i++)
    await page.getByLabel(`Favourite ${i + 1}`).fill(`${words[i]} words`);
  await page.getByRole("button", { name: "Find them" }).click();
  await page
    .getByRole("checkbox", { name: /These are the five I mean/ })
    .check();
  await page.getByRole("button", { name: "Save my taste" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: /How far may an AI helper go/ }),
  ).toBeVisible();
  // Outlast the delayed response; the step must not change.
  await page.waitForTimeout(4000);
  await expect(
    page.getByRole("heading", { name: /How far may an AI helper go/ }),
  ).toBeVisible();
});

test("pronouns: the personal page says you, the Margaret surfaces say Margaret", async ({
  page,
}) => {
  const fake = fakeAccount({ signedIn: true, withPassport: true });
  await mockExperience(page);
  await mockAccount(page, fake);
  await page.goto("/judge");
  await expect(
    page.getByText(
      /This feels like Margaret, but I need to confirm the entrance/,
    ),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/This feels like you/);
  await page.goto("/demo/margaret");
  await expect(
    page.getByText(/Margaret.s Tasteprint, drawn from the things she loves/),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/things they love/);
  await page.goto("/experience");
  await expect(
    page.getByText(/Your Tasteprint, drawn from the things you love/),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    /\b(her|she|Margaret)\b/i,
  );
});
