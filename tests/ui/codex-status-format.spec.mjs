import {test,expect,openCodex,openClaude} from './support/app.mjs';
const key='codex.statusBarUsageFormat';
const template='CX | In {input} | Out {output} | Cache {cacheHitRate}%';
for(const locale of ['en','de-DE','zh-TW','zh-CN','ja','ko','pt-BR','id']) {
  test(`${locale}: Codex usage format is optional, bounded and sends the supported template`,async({page})=>{
    await openCodex(page,{locale,width:360});
    await page.locator('#tab-settings').click();
    const input=page.locator('#set_codex_statusBarUsageFormat');
    await expect(input).toBeVisible();await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('maxlength','120');
    await input.fill(template);await input.dispatchEvent('change');
    await expect.poll(()=>page.evaluate(()=>window.__ccuPostedMessages.filter(m=>m.command==='updateSetting').at(-1)))
      .toEqual({command:'updateSetting',key,value:template});
    await input.fill('');await input.dispatchEvent('change');
    await expect.poll(()=>page.evaluate(()=>window.__ccuPostedMessages.filter(m=>m.command==='updateSetting').at(-1)))
      .toEqual({command:'updateSetting',key,value:''});
    expect(await page.locator('.settings-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  });
}
test('invalid templates remain unsaved and show localized input validity',async({page})=>{
  await openCodex(page,{locale:'zh-CN'});await page.locator('#tab-settings').click();
  const input=page.locator('#set_codex_statusBarUsageFormat');
  for(const value of ['CX {unknown}','CX $(sync) {input}','CX {input']) {
    const before=await page.evaluate(()=>window.__ccuPostedMessages.filter(m=>m.command==='updateSetting').length);
    await input.fill(value);await input.dispatchEvent('change');
    expect(await input.evaluate(el=>el.checkValidity())).toBe(false);
    expect(await input.evaluate(el=>el.validationMessage)).toContain('{input}');
    expect(await page.evaluate(()=>window.__ccuPostedMessages.filter(m=>m.command==='updateSetting').length)).toBe(before);
  }
  await input.fill(template);await input.dispatchEvent('change');
  expect(await input.evaluate(el=>el.checkValidity())).toBe(true);
});
test('the Codex-only preference does not appear in Claude settings',async({page})=>{
  await openClaude(page);await page.locator('#tab-settings').click();
  await expect(page.locator('#set_codex_statusBarUsageFormat')).toHaveCount(0);
});
