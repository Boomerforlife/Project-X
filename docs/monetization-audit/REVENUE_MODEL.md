# Revenue Model

Monthly steady-state model in INR. **Every input is an assumption unless marked [V] (verified, with source) or [S] (supported by a cited estimate).** Tabby has no traffic, conversion or ad data yet, so treat this as a planning frame to replace with real numbers after 2–3 months of analytics.

## 1. Definitions (to avoid double counting)

- **MAU** = signed-in monthly active students (the 1k / 5k / 10k / 50k / 100k scenarios).
- **Paid subscribers** = MAU × conversion. They see **no** ads and produce **no** ad impressions.
- **Free MAU** = MAU − paid. Only they produce ad impressions and affiliate clicks.
- **Ad impressions** come only from the recommended in-app slots (dashboard A1, results B1/C3), **one unit per page view**.
- **Public SEO visitors are excluded from the base model.** They are a separate population (mostly anonymous, partly overlapping with MAU) and are shown as an add-on formula in §6 so they aren't counted twice.
- Revenue is shown **ex-GST**: the model assumes registration (conservative).

## 2. Assumptions

| Input | Conservative | Moderate | Optimistic | Basis |
|---|---|---|---|---|
| Paid conversion (of MAU) | 1.0% | 2.5% | 5.0% | [A] Typical freemium consumer range; no Tabby data |
| Plan mix (monthly / quarterly / annual) | 50 / 30 / 20 | same | same | [A] |
| Prices | ₹59 / ₹149 / ₹499 (recommended) | same | same | PRICING_STRATEGY §3 |
| ARPPU, gross per month | ₹52.72 | ₹52.72 | ₹52.72 | Derived from mix × per-month price |
| GST | 18% (prices inclusive) | same | same | [A] registration assumed |
| Gateway fee | 2.36% of gross | same | same | [V] Razorpay 2% + 18% GST on fee |
| Active days per free MAU per month | 8 | 12 | 16 | [A] |
| Ad-eligible page views per active day | 2 | 2 | 2.5 | [A] dashboard + one results page |
| Fill rate | 60% | 75% | 85% | [A] direct sponsors won't fill 100% early |
| eCPM (per 1,000 filled impressions) | ₹20 | ₹40 | ₹70 | [S] upGrowth puts Indian education page RPM at roughly ₹165+ per 1,000 page views (multiple units). One unit per page plus non-personalised serving for minors suggests a lower per-impression figure. |
| Affiliate: share of free MAU clicking a book/tool link per month | 2% | 4% | 6% | [A] |
| Affiliate: click → purchase | 5% | 5% | 5% | [A] |
| Affiliate: average order | ₹500 | ₹500 | ₹500 | [A] |
| Affiliate: commission | 4% | 4% | 4% | [S] Amazon India books reported at ~3–7% |
| USD → INR | ₹88 | ₹88 | ₹88 | [A] |
| Infra (USD/month) by MAU: 1k $30, 5k $35, 10k $45, 50k $120, 100k $250 | same | same | same | [A] built on Workers Paid $5 [V] + Supabase Pro $25 [V] + compute/storage growth; repo `COST_STRATEGY.md` |
| AI content pipeline | $30/month | same | same | [A] `AI_DAILY_BUDGET_USD` default $1/day (repo) |
| Support/ops (INR/month) by MAU: 0 / 2k / 5k / 25k / 50k | same | same | same | [A] part-time help from 5k MAU |

**Excluded** (fixed costs that are business decisions, not contribution): founder or team salaries, marketing, legal/CA fees, content licensing (potentially large — real PYQs are not yet licensed), and Razorpay subscription-product fees if any (not verified).

## 3. Scenario results (monthly)

Contribution = subscription revenue (ex-GST) − gateway fees + ad revenue + affiliate − infra/AI − support.

### Conservative
| MAU | Paid subs | Subs rev (ex-GST) | Gateway | Ad impressions | Ad rev | Affiliate | Infra + AI | Support | **Contribution** |
|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 10 | ₹447 | ₹12 | 15,840 | ₹190 | ₹20 | ₹5,280 | ₹0 | **−₹4,636** |
| 5,000 | 50 | ₹2,234 | ₹62 | 79,200 | ₹950 | ₹99 | ₹5,720 | ₹2,000 | **−₹4,499** |
| 10,000 | 100 | ₹4,468 | ₹124 | 158,400 | ₹1,901 | ₹198 | ₹6,600 | ₹5,000 | **−₹5,158** |
| 50,000 | 500 | ₹22,338 | ₹622 | 792,000 | ₹9,504 | ₹990 | ₹13,200 | ₹25,000 | **−₹5,990** |
| 100,000 | 1,000 | ₹44,675 | ₹1,244 | 1,584,000 | ₹19,008 | ₹1,980 | ₹24,640 | ₹50,000 | **−₹10,221** |

### Moderate
| MAU | Paid subs | Subs rev (ex-GST) | Gateway | Ad impressions | Ad rev | Affiliate | Infra + AI | Support | **Contribution** |
|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 25 | ₹1,117 | ₹31 | 23,400 | ₹702 | ₹39 | ₹5,280 | ₹0 | **−₹3,453** |
| 5,000 | 125 | ₹5,584 | ₹156 | 117,000 | ₹3,510 | ₹195 | ₹5,720 | ₹2,000 | **₹1,414** |
| 10,000 | 250 | ₹11,169 | ₹311 | 234,000 | ₹7,020 | ₹390 | ₹6,600 | ₹5,000 | **₹6,668** |
| 50,000 | 1,250 | ₹55,844 | ₹1,555 | 1,170,000 | ₹35,100 | ₹1,950 | ₹13,200 | ₹25,000 | **₹53,139** |
| 100,000 | 2,500 | ₹111,688 | ₹3,110 | 2,340,000 | ₹70,200 | ₹3,900 | ₹24,640 | ₹50,000 | **₹108,038** |

### Optimistic
| MAU | Paid subs | Subs rev (ex-GST) | Gateway | Ad impressions | Ad rev | Affiliate | Infra + AI | Support | **Contribution** |
|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 50 | ₹2,234 | ₹62 | 38,000 | ₹2,261 | ₹57 | ₹5,280 | ₹0 | **−₹790** |
| 5,000 | 250 | ₹11,169 | ₹311 | 190,000 | ₹11,305 | ₹285 | ₹5,720 | ₹2,000 | **₹14,728** |
| 10,000 | 500 | ₹22,338 | ₹622 | 380,000 | ₹22,610 | ₹570 | ₹6,600 | ₹5,000 | **₹33,296** |
| 50,000 | 2,500 | ₹111,688 | ₹3,110 | 1,900,000 | ₹113,050 | ₹2,850 | ₹13,200 | ₹25,000 | **₹186,278** |
| 100,000 | 5,000 | ₹223,376 | ₹6,221 | 3,800,000 | ₹226,100 | ₹5,700 | ₹24,640 | ₹50,000 | **₹374,315** |

## 4. Break-even (subscriptions only, no ads)

Net per paying student per month ≈ **₹43.43** (₹52.72 gross → ex-GST − gateway).

| MAU | Monthly cost (infra + AI + support) | Paying students needed | As % of MAU |
|---|---|---|---|
| 1,000 | ₹5,280 | ~122 | 12.2% |
| 5,000 | ₹7,720 | ~178 | 3.6% |
| 10,000 | ₹11,600 | ~267 | 2.7% |
| 50,000 | ₹38,200 | ~880 | 1.8% |
| 100,000 | ₹74,640 | ~1,719 | 1.7% |

## 5. What the model says

1. **Below ~5k MAU, nothing covers costs**, but costs are small (≈₹5k/month) and could stay near ₹0 on free tiers (`COST_STRATEGY.md`). Don't spend engineering time on ad tech at this stage. Focus on product and content.
2. **Subscriptions carry the business in every scenario.** Ads are a meaningful second line only from ~50k MAU and only in moderate/optimistic cases.
3. **In-app ad revenue at 10k MAU is ₹2k–₹23k/month.** One direct sponsor at a flat ₹10k–₹25k/month (§7) can match or beat the network estimate, which supports direct sponsorship over networks.
4. **Affiliate is a rounding error** in the app (₹20–₹6k/month). It matters only on the public resources/book-guide pages, where intent is higher.
5. **Conservative is loss-making at every scale** because 1% conversion at ~₹43 net can't keep up with support costs. The biggest lever is conversion (product quality, mocks, analytics), then price. Ads are not the lever.
6. **The hypothesis prices** (₹50/₹100/₹500, same mix) give ARPPU ₹43.33 gross vs ₹52.72 recommended, about 18% less revenue at the same conversion, mainly because of the cheap quarterly plan.

## 6. Add-on: public SEO ad revenue (separate population)

Not in the tables above. Formula:

```
Monthly SEO ad revenue = public page views × ad units per page × fill × eCPM / 1000
```

Example [A]: 300,000 public question-page views/month × 1 unit × 70% fill × ₹40 eCPM = **₹8,400/month**. This depends entirely on having real, licensed, indexable content, which is blocked today (`STATUS.md`: no real PYQs ingested, indexing off until `NEXT_PUBLIC_ALLOW_INDEXING=true` and API data).

## 7. Direct sponsorship and affiliate pricing frame (not quotes)

There are no agreements and no market-rate data. These are suggested *asking* structures to test:

| Format | Pricing structure | Suggested starting ask [A] |
|---|---|---|
| Dashboard sponsored card (A1), exclusive per exam | Flat monthly fee | ₹8k–₹15k/month at 10k MAU; scale with MAU |
| Results-page card (B1/C3) | Flat monthly or CPM | ₹100–₹200 CPM for exclusive, contextual |
| Sponsored practice challenge (B3) | Per campaign (2 weeks) | ₹10k–₹30k |
| Resource guide sponsorship (E4) | Per guide per month | ₹3k–₹10k |
| Affiliate (books/tools) | Revenue share via Amazon Associates / publisher programmes | Program rates (books ~3–7% reported) |

Prices should be revisited once real impression and click data exist. Always sell flat fees or CPM on **delivered, labelled impressions**, reported in aggregate.

## Sources
- [upGrowth: How to calculate Google AdSense earnings in India (2026)](https://upgrowth.in/how-to-calculate-google-adsense-earnings-india/)
- [upGrowth: Website ad revenue metrics 2026](https://upgrowth.in/website-ad-revenue-metrics-2026/)
- [Razorpay payment gateway pricing explained](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/)
- [Cloudflare Workers pricing (official docs)](https://developers.cloudflare.com/workers/platform/pricing/index.md)
- [Supabase pricing](https://supabase.com/pricing?utm=airanks.net)
- [Cuelinks: Amazon affiliate commission rates guide](https://www.cuelinks.com/blog/amazon-affiliate-commission-rates-guide/), [Fluxnote: Amazon India affiliate rates 2026](https://fluxnote.io/guides/amazon-india-affiliate-commission-rates-2026)
- Repository: `docs/COST_STRATEGY.md`, `packages/ai` budget config (branch `integration/web-api`)
- Model script used to generate these tables: reproduce with the assumptions in §2 (simple spreadsheet arithmetic; no hidden inputs).
