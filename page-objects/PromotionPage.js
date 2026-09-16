const BasePage = require('./BasePage');
const { expect } = require('@playwright/test');

class PromotionPage extends BasePage {

    constructor(page) {
        super(page);
        this.page = page;
        this.selectors = {
            promotionListingHeader: page.locator('span', { hasText: 'All promotions', exact: true }),
            createPromotionButton: page.getByTestId('create-discount'),
            promotionPageHeader: page.locator('span', { hasText: 'Create Discount', exact: true }),
            generalInformationSection: page.locator('h2', { hasText: 'General information', exact: true }),
            addRuleButton: page.getByTestId('add-rule'),
            addRuleDialog: page.getByTestId('add-rule-dialog'),
            ruleNameInput: page.getByTestId('rule-name-input'),
            ruleChannelDropdown: page.getByTestId('channel-dropdown'),
            rewardValueInput: page.getByTestId('reward-value-input'),
            addConditionButton: page.getByTestId('add-condition-button'),
            typeFixedReward: page.getByTestId('fixed-reward-value-type'),
            typePercentageReward: page.getByTestId('percentage-reward-value-type'),
            // ruleConditionRow: page.getByTestId('rule-condition-row'),
            conditionRows: page.getByTestId('rule-condition-row'),
            addConditionButton: page.getByTestId('add-condition-button'),
            saveRuleButton: page.getByTestId('saveRuleButton'),
            successAlert: page.locator('[data-test-type="success"]'),
            addedRule: page.getByTestId('added-rule'),
            addedRuleName: page.getByTestId('rule-name'),
            addedRuleValue: page.getByTestId('rule-value-chip'),
            addedRuleChannel: page.getByTestId('channel-display'),
            addedRuleSummary: page.getByTestId('rule-summary-chip'),
            addedRuleItem: page.getByTestId('rule-condition-item-link'),

        }
    }

    async scrollConditionDropdownToLoadAll(rowIndex, { maxScrolls = 30, settleMs = 300 } = {}) {
        console.log('Row index is: ', rowIndex);
        const input = this.page.getByTestId(`condition-value-${rowIndex}`);
        await input.click();
        const menuId = await input.getAttribute('aria-controls');
        console.log(`Menu ID is ${menuId}`);
        const menu = this.page.locator(`[id="${menuId}"]`);
        const options = menu.getByTestId('select-option');

        let previousCount = -1;
        let currentCount = await options.count();

        for (let i = 0; i < maxScrolls && currentCount !== previousCount; i++) {
            previousCount = currentCount;

            await menu.evaluate(el => el.scrollTo(0, el.scrollHeight));
            await this.page.waitForTimeout(settleMs); // let the async fetch resolve

            currentCount = await options.count();
        }

        if (currentCount === previousCount && currentCount > 0) {
            return currentCount; // stabilized — no new items after the last scroll
        }
        throw new Error(`scrollConditionDropdownToLoadAll: count never stabilized after ${maxScrolls} scrolls (last count: ${currentCount})`);
    }

    async applyConditionOn(rowIndex, appliedOnName) {
        let addedRuleList = [];
        await this.page.getByTestId(`condition-value-${rowIndex}`).fill(appliedOnName);
        await this.page.getByTestId('select-option').filter({ hasText: appliedOnName }).waitFor({ state: 'visible' });
        await this.page.keyboard.press('ArrowDown');
        await this.page.keyboard.press('Enter');
        await this.page.locator('input[placeholder="Add item"]').waitFor({ state: 'visible' });
        await expect(this.selectors.saveRuleButton).toBeEnabled();
        await this.selectors.saveRuleButton.click();
        await this.selectors.successAlert.waitFor({ state: 'visible' });
        await this.page.pause();
        // await this.selectors.addedRule.first().waitFor({ state: 'visible' });
        const addedRules = await this.page.getByTestId('added-rule');
        const ruleCount = await addedRules.count();
        for (let i = 0; i < ruleCount; i++) {
            const name = await addedRules.nth(i).getByTestId('rule-name').innerText();
            const value = await addedRules.nth(i).getByTestId('rule-value-chip').innerText();
            const channel = await addedRules.nth(i).getByTestId('channel-display').innerText();
            const summary = await addedRules.nth(i).getByTestId('rule-summary-chip').innerText();
            const item = await addedRules.nth(i).getByTestId('rule-condition-item-link').innerText();
            addedRuleList.push({
                ruleName: name,
                ruleValue: value,
                ruleChannel: channel,
                ruleSummary: summary,
                ruleItem: item,
            })
        }

        return addedRuleList;
    }

    async getConditionRowCount() {
        return await this.selectors.conditionRows.count();
    }

    // Appends a NEW condition row — always safe, never overwrites existing
    // rows, because "Add condition" only ever appends to the end and the new
    // row's index is guaranteed to equal the count *before* the click.
    async addCondition(predicateLabel, values) {
        const newIndex = await this.getConditionRowCount();
        await this.selectors.addConditionButton.click();

        const nameField = this.page.getByTestId(`condition-name-${newIndex}`);
        await nameField.click();
        await nameField.fill(predicateLabel);
        await this.page.getByTestId('select-option').filter({ hasText: predicateLabel }).waitFor({ state: 'visible' });
        await this.page.getByTestId('select-option').filter({ hasText: predicateLabel }).click();

        const valueInput = this.page.getByTestId(`condition-value-${newIndex}`);
        for (const value of values) {
            await valueInput.click();
            await valueInput.fill(value);
            await this.page.getByTestId('select-option').filter({ hasText: value }).waitFor({ state: 'visible' });
            await this.page.getByTestId('select-option').filter({ hasText: value }).click();
        }

        return newIndex; // caller can reference this exact row afterward
    }

    // Reads what's currently set at a given row index, without touching it —
    // the predicate combobox stores its selected label in the input's `value`
    // attribute (same pattern as the Channel dropdown you already handled).
    async readConditionPredicate(rowIndex) {
        return await this.page.getByTestId(`condition-name-${rowIndex}`).inputValue();
    }

    // Finds an existing row by what it's already set to, instead of assuming
    // a fixed index — use this BEFORE deciding whether to add a new condition
    // or reuse one that's already there.
    async findConditionRowIndexByPredicate(predicateLabel) {
        const rowCount = await this.getConditionRowCount();
        for (let i = 0; i < rowCount; i++) {
            const current = await this.readConditionPredicate(i);
            if (current === predicateLabel) return i;
        }
        return -1; // not found
    }

    async createPromotion() {
        await this.selectors.promotionListingHeader.waitFor({ state: 'visible' });
        await this.selectors.createPromotionButton.click();
        await this.selectors.promotionPageHeader.waitFor({ state: 'visible' });

    }

    async navigateToPromotion(promoName) {
        await this.page.goto(`discounts/sales/${promoName.id}`);
        await this.selectors.generalInformationSection.waitFor({ state: 'visible' });
        await this.dismissAnnouncement();
    }

    async applyPromoRule(ruleInfo) {
        await this.selectors.addRuleButton.click();
        await this.selectors.addRuleDialog.waitFor({ state: 'visible' });

        // await this.selectors.addConditionButton.waitFor({state: 'visible' });

        await this.selectors.ruleNameInput.fill(ruleInfo.name);
        await this.selectors.ruleChannelDropdown.click(); // opens the dropdown regardless of current value
        // await this.page.pause();
        await this.selectors.ruleChannelDropdown.fill('');
        await this.selectors.ruleChannelDropdown.fill(ruleInfo.channel);
        await this.page.getByTestId('select-option').filter({ hasText: ruleInfo.channel }).waitFor({ state: 'visible' });
        await this.page.keyboard.press('ArrowDown');
        await this.page.keyboard.press('Enter');
        if (ruleInfo.rewardTypePercentage) {
            await this.selectors.typePercentageReward.waitFor({ state: 'visible' });
            await this.selectors.typePercentageReward.click();
        }
        else {
            await this.selectors.typeFixedReward.waitFor({ state: 'visible' });
            await this.selectors.typeFixedReward.click();
        }
        await this.selectors.rewardValueInput.fill(ruleInfo.rewardValue);

    }

}

module.exports = PromotionPage;