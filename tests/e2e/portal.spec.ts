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
