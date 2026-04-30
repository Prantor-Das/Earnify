"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@virlo/shared";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type CampaignListItem = {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  platforms: string[];
  postCount: number;
};

function formatXlm(value: number) {
  return `${new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }).format(value)} XLM`;
}

export default function CampaignIndexPage() {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as ApiResponse<
          CampaignListItem[]
        >;

        if (!cancelled && payload.success && payload.data) {
          setCampaigns(payload.data);
        }
      } catch {
        if (!cancelled) {
          setCampaigns([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-5 py-16 text-[#0A0A0A]">
      <section className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col justify-between gap-4 border-b border-[#E5E5E5] pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium uppercase text-[#525252]">
              Campaigns
            </p>
            <h1 className="mt-3 text-5xl font-medium">Explore Campaigns</h1>
          </div>
          <Link
            href="/login"
            className="inline-flex w-fit items-center justify-center border border-[#F59E0B] px-5 py-3 text-sm font-medium text-[#F59E0B] transition-colors hover:border-[#D97706] hover:bg-[#D97706] hover:text-[#0A0A0A]"
          >
            Start Earning
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-56 animate-pulse border border-[#E5E5E5] bg-[#F5F5F5] [border-radius:6px]"
              />
            ))}
          </div>
        ) : campaigns.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaign/${campaign.id}`}
                className="flex min-h-64 flex-col border border-[#E5E5E5] bg-[#FAFAFA] p-6 transition-colors hover:border-[#F59E0B] [border-radius:6px]"
              >
                <div className="mb-6 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase text-[#F59E0B]">
                    {campaign.status}
                  </span>
                  <span className="text-xs text-[#525252]">
                    {campaign.postCount} creators
                  </span>
                </div>
                <h2 className="text-2xl font-medium">{campaign.title}</h2>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#525252]">
                  {campaign.description}
                </p>
                <div className="mt-auto pt-8">
                  <p className="text-sm text-[#525252]">Budget</p>
                  <p className="mt-1 text-xl font-medium">
                    {formatXlm(campaign.remainingBudget)} remaining
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-[#E5E5E5] bg-[#F5F5F5] p-10 text-center [border-radius:6px]">
            <h2 className="text-2xl font-medium">No campaigns are live yet</h2>
            <p className="mt-3 text-sm text-[#525252]">
              Check back soon for new Virlo campaigns.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
