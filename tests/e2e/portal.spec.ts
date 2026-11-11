import { test, expect } from '@playwright/test';

test.describe('Enterprise IT Support Portal Browser Workflows', () => {
  test('Employee uses development sign-in, submits a ticket, and views mock AI guidance', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('h1')).toContainText('AIIT');

    // Authenticate as Employee Tawsif Zawad
    await page.fill('#login-email-input', 'tawsif.zawad@upstra.com');
    await page.click('#login-submit-btn');

    await expect(page.getByTestId('active-user-badge')).toContainText('Tawsif Zawad');

    // Submit a new Outlook configuration ticket
    await page.click('button[data-tab="create"]');
    await page.selectOption('#ticket-category', 'cat-outlook-config');
    await page.selectOption('#ticket-service-osPlatform', 'macOS');
    await page.fill('#ticket-title', 'Outlook STARTTLS setup prompt on macOS');
    await page.fill('#ticket-description', 'Please provide steps to configure IMAP 993 and SMTP 587 STARTTLS.');
    await page.click('#submit-ticket-btn');

    await page.click('button[data-tab="tickets"]');
    await expect(page.getByTestId('detail-ticket-status')).toContainText('RESOLVED_PENDING_CONFIRMATION');
    await expect(page.getByTestId('ai-decision-box')).toContainText('LOW_RISK_OUTLOOK_CONFIGURATION');
  });
});

for(const [email,label,privileged] of [
 ['rahim.chowdhury@client.upstra.local','Rahim Chowdhury',false],
 ['kamal.hossain@upstra.local','Kamal Hossain',true],
 ['farhana.ahmed@upstra.local','Farhana Ahmed',true],
] as const) test(`${label} dashboard, navigation and session restoration`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/app');await page.fill('#login-email-input',email);await page.click('#login-submit-btn');
 await expect(page.getByTestId('active-user-badge')).toContainText(label);
 if(privileged){await page.click('#tab-btn-approvals');await expect(page.locator('#approvals-container')).toBeVisible();}
 else await expect(page.locator('#tab-btn-approvals')).toBeHidden();
 for(const tab of ['catalog','notifications','assets','kb']) {await page.click(`button[data-tab="${tab}"]`);await expect(page.locator('#tab-'+tab)).toBeVisible();}
 if(email.startsWith('farhana')) {await page.click('#tab-btn-cto');await expect(page.locator('#tab-cto')).toBeVisible();await page.click('#tab-btn-audit');await expect(page.locator('#tab-audit')).toBeVisible();}
 await page.reload();await expect(page.getByTestId('active-user-badge')).toContainText(label);
 expect(await page.evaluate(()=>localStorage.getItem('itsupport_token'))).toBeNull();
 expect(errors).toEqual([]);
});

test('slow initial data cannot reset an early support-form navigation',async({page})=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/analytics/summary',async route=>{await gate;await route.continue();});
 await page.goto('/app');await page.fill('#login-email-input','tawsif.zawad@upstra.com');await page.click('#login-submit-btn');
 await expect(page.getByTestId('active-user-badge')).toContainText('Tawsif Zawad');
 // Identity is known, but initial data is deliberately held. Navigation must
 // remain unavailable until initialization can no longer switch the user's tab.
 await expect(page.locator('#workspace-section')).toBeHidden();
 release();await expect(page.locator('#workspace-section')).toBeVisible();
 await page.click('button[data-tab="create"]');await page.fill('#ticket-title','Form survives initialization');
 await expect(page.locator('#tab-create')).toBeVisible();await expect(page.locator('#ticket-title')).toHaveValue('Form survives initialization');
});

for (const width of [390, 1280]) {
  test(`M1 catalog fields validate and retain unrelated input at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app');
    await page.fill('#login-email-input', 'tawsif.zawad@upstra.com');
    await page.click('#login-submit-btn');
    await expect(page.getByTestId('active-user-badge')).toBeVisible();
    await page.click('#quick-create');
    const form = page.locator('#create-ticket-form');
    const category = form.locator('#ticket-category');
    await category.selectOption('cat-outlook-config');
    await form.getByLabel('Operating System (required)').selectOption('macOS');
    await form.getByLabel('Outlook Version').fill('16.90');
    await page.fill('#ticket-title', 'M1 synthetic category switching');
    await page.fill('#ticket-description', 'M1 synthetic request to review access requirements.');
    await category.selectOption('cat-ad-account');
    await expect(form.getByLabel('Operating System (required)')).toHaveCount(0);
    await expect(page.locator('#ticket-title')).toHaveValue('M1 synthetic category switching');
    await expect(page.locator('#ticket-description')).toHaveValue('M1 synthetic request to review access requirements.');
    await page.click('#submit-ticket-btn');
    const group = form.getByLabel('Target AD Security Group / Resource (required)');
    await expect(group).toBeFocused();
    expect(await group.evaluate(input => (input as HTMLInputElement).validationMessage)).toBeTruthy();
    await group.fill('Synthetic readers');
    await form.getByLabel('Business Justification (required)').fill('Review fixture access');
    await category.selectOption('cat-outlook-config');
    await expect(form.getByLabel('Operating System (required)')).toHaveValue('');
    await expect(form.getByLabel('Outlook Version')).toHaveValue('');
    await category.selectOption('cat-ad-account');
    await expect(group).toHaveValue('');
    await group.fill('Synthetic readers');
    await form.getByLabel('Business Justification (required)').fill('Review fixture access');
    const posted = page.waitForResponse(response => response.url().endsWith('/api/tickets') && response.request().method() === 'POST');
    await page.click('#submit-ticket-btn');
    const response = await posted;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON().customFormPayload).toEqual({
      targetAdGroup: 'Synthetic readers', businessJustification: 'Review fixture access',
    });
    await expect(page.getByTestId('detail-ticket-status')).toHaveText('ASSIGNED_TO_IT');
  });
}
