import { faker } from "@faker-js/faker";
import {
  PrismaClient,
  InvestorType,
  DataSource,
  ExclusionSource,
  LeadTier,
  PipelineStage,
  SearchStatus,
  EnrichmentJobStatus,
  DiscoveryRunStatus,
  UsageEventType,
  WorkspaceRole,
} from "@prisma/client";

const prisma = new PrismaClient();

faker.seed(42);

const SECTORS = [
  "b2b saas",
  "fintech",
  "embedded payments",
  "healthtech",
  "climate",
  "consumer",
  "marketplace",
  "devtools",
  "ai/ml",
  "biotech",
  "proptech",
  "edtech",
  "cybersecurity",
  "logistics",
  "gaming",
  "hardware",
];

const STAGE_ORDER = ["pre-seed", "seed", "series-a", "series-b", "growth"] as const;
type Stage = (typeof STAGE_ORDER)[number];

const GEOGRAPHIES = ["US", "Canada", "UK", "EU", "LatAm", "APAC", "MENA", "Africa", "Global"];

const CHECK_RANGES_BY_STAGE: Record<Stage, [number, number]> = {
  "pre-seed": [50_000, 500_000],
  seed: [250_000, 3_000_000],
  "series-a": [2_000_000, 12_000_000],
  "series-b": [8_000_000, 30_000_000],
  growth: [20_000_000, 100_000_000],
};

function pickSome<T>(arr: readonly T[], min: number, max: number): T[] {
  const n = faker.number.int({ min, max: Math.min(max, arr.length) });
  return faker.helpers.arrayElements(arr, n);
}

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function investorTypeWeighted(): InvestorType {
  return faker.helpers.weightedArrayElement([
    { value: InvestorType.VC, weight: 55 },
    { value: InvestorType.ANGEL, weight: 20 },
    { value: InvestorType.FAMILY_OFFICE, weight: 12 },
    { value: InvestorType.CVC, weight: 8 },
    { value: InvestorType.STRATEGIC, weight: 5 },
  ]);
}

function firmName(type: InvestorType): string {
  if (type === InvestorType.ANGEL) return faker.person.fullName();
  const suffix = faker.helpers.arrayElement([
    "Ventures",
    "Capital",
    "Partners",
    "Fund",
    "Capital Partners",
    "Ventures Group",
  ]);
  return `${faker.company.name().replace(/,?\s*(LLC|Inc\.?|Ltd\.?|Group|and Sons)$/i, "")} ${suffix}`;
}

function buildThesis(sectors: string[], stages: Stage[], geographies: string[]): string {
  return `We back ${stages.join(" and ")} companies in ${sectors.join(", ")}. Active across ${geographies.join(
    ", "
  )}. We look for category-defining teams with early signs of product-market fit.`;
}

async function buildInvestor(overrides?: {
  type?: InvestorType;
  sectors?: string[];
  stages?: Stage[];
  geographies?: string[];
  thesisExtra?: string;
  freshFund?: boolean;
}) {
  const type = overrides?.type ?? investorTypeWeighted();
  const sectors = overrides?.sectors ?? pickSome(SECTORS, 1, 4);
  const stages = overrides?.stages ?? (pickSome(STAGE_ORDER, 1, 3) as Stage[]);
  const geographies = overrides?.geographies ?? pickSome(GEOGRAPHIES, 1, 3);

  const checkMins = stages.map((s) => CHECK_RANGES_BY_STAGE[s][0]);
  const checkMaxs = stages.map((s) => CHECK_RANGES_BY_STAGE[s][1]);
  const checkMin = Math.min(...checkMins);
  const checkMax = Math.max(...checkMaxs);

  const freshFund = overrides?.freshFund ?? faker.datatype.boolean({ probability: 0.5 });
  const lastFundCloseDate = freshFund
    ? monthsAgo(faker.number.int({ min: 1, max: 20 }))
    : monthsAgo(faker.number.int({ min: 25, max: 60 }));

  let thesis = buildThesis(sectors, stages, geographies);
  if (overrides?.thesisExtra) thesis = `${thesis} ${overrides.thesisExtra}`;

  return prisma.investor.create({
    data: {
      name: firmName(type),
      type,
      thesis,
      sectors,
      stages,
      checkMin,
      checkMax,
      geographies,
      fundVintageYear: faker.number.int({ min: 2015, max: 2025 }),
      lastFundCloseDate,
      aum: BigInt(faker.number.int({ min: 5_000_000, max: 2_000_000_000 })),
      website: faker.internet.url(),
      linkedinUrl: `https://www.linkedin.com/company/${faker.helpers.slugify(faker.company.name()).toLowerCase()}`,
    },
  });
}

async function addContacts(investorId: string, count: number) {
  const contacts = [];
  for (let i = 0; i < count; i++) {
    const name = faker.person.fullName();
    const title = faker.helpers.arrayElement([
      "Partner",
      "Principal",
      "Managing Director",
      "General Partner",
      "Associate",
      "Investor",
    ]);
    const email = faker.internet.email({ firstName: name.split(" ")[0] }).toLowerCase();
    const now = new Date().toISOString();
    const contact = await prisma.contact.create({
      data: {
        investorId,
        name,
        title,
        email,
        emailVerifiedAt: faker.datatype.boolean({ probability: 0.6 }) ? faker.date.recent({ days: 90 }) : null,
        linkedinUrl: `https://www.linkedin.com/in/${faker.helpers.slugify(name).toLowerCase()}`,
        dataSource: faker.helpers.arrayElement([
          DataSource.MANUAL,
          DataSource.ENRICHMENT_API,
          DataSource.AI_INFERRED,
        ]),
        provenance: {
          name: { value: name, source: "enrichment_api", fetchedAt: now },
          email: { value: email, source: "enrichment_api", fetchedAt: now },
          title: { value: title, source: "manual", fetchedAt: now },
        },
      },
    });
    contacts.push(contact);
  }
  return contacts;
}

async function addDeals(
  investorId: string,
  sectors: string[],
  stages: Stage[],
  opts?: { recentCount?: number; recentSector?: string; recentStage?: string }
) {
  const dealCount = faker.number.int({ min: 0, max: 8 });
  const deals = [];

  for (let i = 0; i < dealCount; i++) {
    const sector = faker.helpers.arrayElement(sectors.length ? sectors : SECTORS);
    const stage = faker.helpers.arrayElement(stages.length ? stages : STAGE_ORDER);
    deals.push({
      investorId,
      company: faker.company.name(),
      sector,
      stage,
      date: faker.date.past({ years: 4 }),
      amount: faker.number.int({ min: 100_000, max: 20_000_000 }),
      sourceUrl: faker.internet.url(),
    });
  }

  if (opts?.recentCount) {
    for (let i = 0; i < opts.recentCount; i++) {
      deals.push({
        investorId,
        company: faker.company.name(),
        sector: opts.recentSector ?? sectors[0] ?? "fintech",
        stage: opts.recentStage ?? stages[0] ?? "seed",
        date: monthsAgo(faker.number.int({ min: 1, max: 18 })),
        amount: faker.number.int({ min: 250_000, max: 5_000_000 }),
        sourceUrl: faker.internet.url(),
      });
    }
  }

  if (deals.length) {
    await prisma.deal.createMany({ data: deals });
  }
  return deals;
}

/**
 * Everything below this point (besides Users/Workspaces, which are
 * upserted) is created via .create(), not upsert - re-running the script
 * against a DB that already has seed data would otherwise pile up a second,
 * third, ... copy of the same 200 (faker.seed(42)-deterministic, so
 * identically named) investors and demo records every time. Wiping this
 * reference data first makes `pnpm seed` safe to run as many times as you
 * want, always converging on the same ~200 investors instead of
 * accumulating duplicates.
 */
async function resetSeedData(): Promise<void> {
  await prisma.usageEvent.deleteMany();
  await prisma.discoveryRun.deleteMany();
  await prisma.enrichmentJob.deleteMany();
  await prisma.warmPath.deleteMany();
  await prisma.outreachDraft.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.exclusionList.deleteMany();
  await prisma.search.deleteMany();
  await prisma.investor.deleteMany();
}

async function main() {
  console.log("Seeding database...");

  await resetSeedData();

  // --- Users -----------------------------------------------------------
  const founder = await prisma.user.upsert({
    where: { email: "founder@demo.raisely.dev" },
    update: {},
    create: {
      email: "founder@demo.raisely.dev",
      name: "Jamie Founder",
      role: "FOUNDER",
      emailVerified: new Date(),
    },
  });

  const advisor = await prisma.user.upsert({
    where: { email: "advisor@demo.raisely.dev" },
    update: {},
    create: {
      email: "advisor@demo.raisely.dev",
      name: "Riley Advisor",
      role: "ADVISOR",
      emailVerified: new Date(),
    },
  });

  // --- Workspaces (advisor mode: one user, many workspaces) ------------
  const founderWorkspace = await prisma.workspace.upsert({
    where: { slug: "acme-fintech" },
    update: {},
    create: {
      name: "Acme Fintech",
      slug: "acme-fintech",
      ownerId: founder.id,
      plan: "free",
      usageLimit: 100,
      members: {
        create: [{ userId: founder.id, role: WorkspaceRole.OWNER }],
      },
    },
  });

  const advisorWorkspaceA = await prisma.workspace.upsert({
    where: { slug: "portco-alpha" },
    update: {},
    create: {
      name: "Portco Alpha",
      slug: "portco-alpha",
      ownerId: advisor.id,
      plan: "pro",
      usageLimit: 500,
      members: {
        create: [{ userId: advisor.id, role: WorkspaceRole.ADVISOR }],
      },
    },
  });

  const advisorWorkspaceB = await prisma.workspace.upsert({
    where: { slug: "portco-beta" },
    update: {},
    create: {
      name: "Portco Beta",
      slug: "portco-beta",
      ownerId: advisor.id,
      plan: "pro",
      usageLimit: 500,
      members: {
        create: [{ userId: advisor.id, role: WorkspaceRole.ADVISOR }],
      },
    },
  });

  // --- Showcase investors (exercise every scoring factor deterministically) --

  // 1. Strong thesis + stage + geography + recent activity + fresh fund match
  //    for a "b2b fintech seed round in London" query.
  const showcaseFit = await buildInvestor({
    type: InvestorType.VC,
    sectors: ["fintech", "embedded payments", "b2b saas"],
    stages: ["seed", "series-a"],
    geographies: ["UK", "EU"],
    thesisExtra: "We have deep conviction in embedded fintech and B2B payments infrastructure.",
    freshFund: true,
  });
  await prisma.investor.update({
    where: { id: showcaseFit.id },
    data: { lastFundCloseDate: monthsAgo(14) },
  });
  await addContacts(showcaseFit.id, 2);
  await addDeals(showcaseFit.id, ["fintech", "b2b saas"], ["seed"], {
    recentCount: 3,
    recentSector: "fintech",
    recentStage: "seed",
  });

  // 2. Stale investor: freshness decay (no recent deals, old fund close)
  const showcaseStale = await buildInvestor({
    type: InvestorType.VC,
    sectors: ["fintech", "b2b saas"],
    stages: ["seed"],
    geographies: ["UK", "EU"],
    freshFund: false,
  });
  await prisma.investor.update({
    where: { id: showcaseStale.id },
    data: { lastFundCloseDate: monthsAgo(48) },
  });
  await addContacts(showcaseStale.id, 1);
  // Only old deals.
  await prisma.deal.create({
    data: {
      investorId: showcaseStale.id,
      company: faker.company.name(),
      sector: "fintech",
      stage: "seed",
      date: monthsAgo(40),
      amount: 1_000_000,
      sourceUrl: faker.internet.url(),
    },
  });

  // 3. Conflict investor: backs a direct competitor in the same sector.
  const showcaseConflict = await buildInvestor({
    type: InvestorType.VC,
    sectors: ["fintech", "embedded payments"],
    stages: ["seed", "series-a"],
    geographies: ["UK", "US"],
    freshFund: true,
  });
  await addContacts(showcaseConflict.id, 2);
  await addDeals(showcaseConflict.id, ["fintech"], ["seed"]);
  await prisma.deal.create({
    data: {
      investorId: showcaseConflict.id,
      company: "CompetitorCo",
      sector: "embedded payments",
      stage: "seed",
      date: monthsAgo(10),
      amount: 2_000_000,
      sourceUrl: faker.internet.url(),
    },
  });

  // --- Bulk investors to reach ~200 records -----------------------------
  const TARGET_COUNT = 200;
  const remaining = TARGET_COUNT - 3;
  const bulkInvestors = [];
  for (let i = 0; i < remaining; i++) {
    const investor = await buildInvestor();
    bulkInvestors.push(investor);
    await addContacts(investor.id, faker.number.int({ min: 1, max: 3 }));
    await addDeals(investor.id, investor.sectors, investor.stages as Stage[]);
  }

  const totalInvestors = await prisma.investor.count();
  console.log(`Seeded ${totalInvestors} investors.`);

  // --- Exclusion list ----------------------------------------------------
  const exclusionList = await prisma.exclusionList.create({
    data: {
      workspaceId: founderWorkspace.id,
      name: "LinkedIn connections",
      entries: {
        create: [
          {
            workspaceId: founderWorkspace.id,
            name: showcaseStale.name,
            linkedinUrl: showcaseStale.linkedinUrl,
            source: ExclusionSource.LINKEDIN_IMPORT,
          },
          {
            workspaceId: founderWorkspace.id,
            name: faker.person.fullName(),
            email: faker.internet.email().toLowerCase(),
            source: ExclusionSource.CSV,
          },
        ],
      },
    },
  });
  console.log(`Created exclusion list "${exclusionList.name}" for ${founderWorkspace.name}.`);

  // --- Search + Leads (demonstrating the fit-score evidence contract) ----
  const search = await prisma.search.create({
    data: {
      workspaceId: founderWorkspace.id,
      createdById: founder.id,
      name: "B2B fintech seed - London",
      queryText: "raising a $3M seed for a b2b fintech in London",
      structuredQuery: {
        stages: ["seed"],
        sectors: ["fintech", "b2b saas"],
        geographies: ["UK", "EU"],
        checkRange: { min: 250_000, max: 3_000_000 },
        investorTypes: ["VC"],
        keywords: ["embedded fintech", "b2b payments"],
      },
      status: SearchStatus.COMPLETE,
      saved: true,
      excludedCount: 1,
    },
  });

  const fitLead = await prisma.lead.create({
    data: {
      workspaceId: founderWorkspace.id,
      searchId: search.id,
      investorId: showcaseFit.id,
      fitScore: 84,
      fitReasons: {
        score: 84,
        components: [
          {
            factor: "thesis_match",
            points: 30,
            max: 35,
            evidence: "Thesis mentions embedded fintech and B2B payments",
          },
          {
            factor: "stage_fit",
            points: 20,
            max: 20,
            evidence: "Leads seed rounds, $250K-3M checks",
          },
          {
            factor: "recent_activity",
            points: 18,
            max: 25,
            evidence: "3 fintech seed deals in last 18 months",
          },
          { factor: "geography", points: 10, max: 10, evidence: "Active in UK/EU" },
          { factor: "freshness", points: 6, max: 10, evidence: "Fund closed 14 months ago" },
        ],
        flags: [],
      },
      tier: LeadTier.A,
      pipelineStage: PipelineStage.CONTACTED,
      tags: ["warm-intro", "priority"],
    },
  });

  await prisma.lead.create({
    data: {
      workspaceId: founderWorkspace.id,
      searchId: search.id,
      investorId: showcaseConflict.id,
      fitScore: 52,
      fitReasons: {
        score: 52,
        components: [
          {
            factor: "thesis_match",
            points: 22,
            max: 35,
            evidence: "Thesis mentions fintech, no explicit B2B payments language",
          },
          { factor: "stage_fit", points: 20, max: 20, evidence: "Leads seed and Series A rounds" },
          {
            factor: "recent_activity",
            points: 5,
            max: 25,
            evidence: "1 fintech seed deal in last 18 months",
          },
          { factor: "geography", points: 5, max: 10, evidence: "Active in US, partial UK overlap" },
          { factor: "freshness", points: 0, max: 10, evidence: "No recent fund close on record" },
        ],
        flags: [
          {
            type: "conflict",
            detail: "Portfolio includes CompetitorCo (embedded payments)",
          },
        ],
      },
      tier: LeadTier.C,
      pipelineStage: PipelineStage.IDENTIFIED,
      tags: [],
    },
  });

  await prisma.lead.create({
    data: {
      workspaceId: founderWorkspace.id,
      searchId: search.id,
      investorId: showcaseStale.id,
      fitScore: 38,
      fitReasons: {
        score: 38,
        components: [
          { factor: "thesis_match", points: 25, max: 35, evidence: "Thesis mentions fintech and B2B SaaS" },
          { factor: "stage_fit", points: 20, max: 20, evidence: "Leads seed rounds" },
          {
            factor: "recent_activity",
            points: 0,
            max: 25,
            evidence: "No deals recorded in last 24 months",
          },
          { factor: "geography", points: 10, max: 10, evidence: "Active in UK/EU" },
          {
            factor: "freshness",
            points: -17,
            max: 10,
            evidence: "Fund closed 48 months ago, no evidence of dry powder",
          },
        ],
        flags: [{ type: "warning", detail: "No activity signal in the last 24 months" }],
      },
      tier: LeadTier.C,
      pipelineStage: PipelineStage.IDENTIFIED,
      tags: [],
    },
  });

  // --- Warm path -----------------------------------------------------------
  const [fitContact] = await prisma.contact.findMany({
    where: { investorId: showcaseFit.id },
    take: 1,
  });
  if (fitContact) {
    await prisma.warmPath.create({
      data: {
        workspaceId: founderWorkspace.id,
        leadId: fitLead.id,
        targetContactId: fitContact.id,
        mutualName: "Sam Chen (ex-colleague, Series A intro)",
        strengthScore: 72,
        verified: true,
      },
    });
    console.log(`Created warm path to ${fitContact.name} via Sam Chen.`);
  }

  // --- Enrichment job + discovery run + usage events -----------------------
  await prisma.enrichmentJob.create({
    data: {
      workspaceId: founderWorkspace.id,
      investorId: showcaseFit.id,
      status: EnrichmentJobStatus.COMPLETE,
      startedAt: monthsAgo(1),
      completedAt: monthsAgo(1),
    },
  });

  await prisma.discoveryRun.create({
    data: {
      workspaceId: founderWorkspace.id,
      createdById: founder.id,
      comparableCompanies: ["Stripe", "Wise", "Ramp"],
      status: DiscoveryRunStatus.AWAITING_APPROVAL,
      previewResults: {
        candidates: [
          {
            investorId: showcaseFit.id,
            investorName: showcaseFit.name,
            matchType: "co_investment",
            score: 82,
            reason: "Co-invested with 2 direct matches",
            matchedCompanies: ["Stripe", "Ramp"],
          },
        ],
        inferredSectors: ["fintech"],
        generatedAt: monthsAgo(1).toISOString(),
      },
    },
  });

  await prisma.usageEvent.createMany({
    data: [
      { workspaceId: founderWorkspace.id, userId: founder.id, type: UsageEventType.SEARCH, costUnits: 3 },
      {
        workspaceId: founderWorkspace.id,
        userId: founder.id,
        type: UsageEventType.ENRICHMENT,
        costUnits: 1,
        metadata: { investorId: showcaseFit.id },
      },
      {
        workspaceId: founderWorkspace.id,
        userId: founder.id,
        type: UsageEventType.DISCOVERY_RUN,
        costUnits: 5,
      },
    ],
  });

  console.log("Seed complete.");
  console.log(`  Workspaces: acme-fintech (founder), portco-alpha + portco-beta (advisor)`);
  console.log(`  Investors: ${totalInvestors}`);
  console.log(`  Showcase fit lead score: 84 (${showcaseFit.name})`);
  console.log(`  Conflict flag on: ${showcaseConflict.name}`);
  console.log(`  Freshness decay on: ${showcaseStale.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
