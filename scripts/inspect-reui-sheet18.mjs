import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "reui-sheet18-reference";
await mkdir(dir, { recursive:true });
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({ viewport:{width:1440,height:1100}, locale:"en-US" });
const url = "https://reui.io/preview/base/sheet-18";
const result = {url, timestamp:new Date().toISOString(), buttons:[]};
try {
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:35000});
  result.status=response?.status();
  result.finalURL=page.url();
  await page.waitForTimeout(2400);
  await writeFile(dir+"/before.html",await page.content());
  await page.screenshot({path:dir+"/before.png",fullPage:true});
  result.title=await page.title();
  result.buttons=await page.locator("button").evaluateAll(nodes=>nodes.map(n=>({text:(n.textContent||"").trim().slice(0,90),title:n.getAttribute("title"),aria:n.getAttribute("aria-label")})).slice(0,80));
  const labels=["Edit rule","Edit","Open","View rule","Rule","Details","Sheet"];
  for (const label of labels) {
    const control=page.getByRole("button",{name:new RegExp(label,"i")}).first();
    if (await control.count()) {
      try{await control.click({timeout:3000}); result.clicked=label; break;}catch{}
    }
  }
  await page.waitForTimeout(1000);
  await writeFile(dir+"/after.html",await page.content());
  await page.screenshot({path:dir+"/after.png",fullPage:true});
  result.dialogs=await page.locator('[role="dialog"]').count();
  result.visibleText=(await page.locator("body").innerText()).slice(0,14000);
} catch(e){result.error=String(e);}
finally {await browser.close();}
await writeFile(dir+"/inspection.json",JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,url:result.finalURL,clicked:result.clicked,dialogs:result.dialogs,error:result.error}));
