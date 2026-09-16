const PromotionPage = require('../../page-objects/PromotionPage');
const { query } = require('../../utils/db-client');
const { test, expect } = require('../../fixtures/promotion');

test.describe('This will test promotion rules vis-a-vis products/variants', () => {
    let promotionPage;
    const ruleInfo = {
        name: 'Test Rule',
        channel: 'Channel-USD',
        rewardTypePercentage: true,
        rewardValue: '20',
        appliedOn: 'variant',
        appliedOnName: 'Team Shirt - S',
        description: 'A new rule'
    }
    test.beforeEach(async ({ page }) => {
        promotionPage = new PromotionPage(page);

    })

    test('Add large-catalog pagination coverage in Assign Variant dialogs', async ({ page, testPromotion }) => {
        console.log('Promotion created is: ', testPromotion);
        await page.goto('dashboard/discounts/sales');
        // await promotionPage.createPromotion();
        await promotionPage.navigateToPromotion(testPromotion);
        await promotionPage.applyPromoRule(ruleInfo);
        const existingIndex = await promotionPage.findConditionRowIndexByPredicate('Variants');
        const rowIndex = existingIndex !== -1
            ? existingIndex // reuse it, touch nothing else
            : await promotionPage.addCondition('Variants', []); // append fresh, existing rows untouched
        // From here, interact with condition-value-${rowIndex} directly for the
        // pagination/search assertions — you now have a guaranteed-correct row
        // index to scope every locator against.
        // await promotionPage.applyConditionOn(rowIndex, ruleInfo.appliedOnName);
        const totalLoaded = await promotionPage.scrollConditionDropdownToLoadAll(rowIndex);
        const dbCount = (await query('SELECT COUNT(*) FROM product_productvariant'))[0].count;
        expect(totalLoaded).toBe(Number(dbCount));
        const addedRuleList = await promotionPage.applyConditionOn(rowIndex, ruleInfo.appliedOnName);
        const match = addedRuleList.find(item => item.ruleName.trim() === ruleInfo.name);
        expect(match).toBeDefined();
        expect(match.ruleName.trim()).toBe(ruleInfo.name);
        expect(match.ruleValue.replace(/[%$]/g, '').trim()).toBe(ruleInfo.rewardValue);
        expect(match.ruleChannel.trim()).toBe(ruleInfo.channel);
        expect(match.ruleSummary.toLowerCase().trim()).toMatch(new RegExp(ruleInfo.appliedOn.toLowerCase()));
        expect(match.ruleItem.trim()).toBe(ruleInfo.appliedOnName);
    })
})