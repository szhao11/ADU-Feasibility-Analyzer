"use client";

import { useState } from "react";
import { Loader2, MapPin, CheckCircle2 } from "lucide-react";
import type { FeasibilityProject } from "@/lib/types";
import { lookupBurbankParcel } from "@/lib/gis/burbank-lookup";
import {
  parsePropertySearch,
  propertySearchDisplayValue,
} from "@/lib/gis/parse-property-search";
import { syncEnvelopeFromSitePlan } from "@/lib/geometry/site-plan";
import { getSitePlanSyncOptions } from "@/lib/rules/envelope-requirements";
import { Button, TextInput, Card } from "@/components/ui/Form";

export function StepProperty({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const [searchQuery, setSearchQuery] = useState(() =>
    propertySearchDisplayValue(project.property)
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    project.sitePlan.lookupMessage ?? null
  );

  async function runLookup() {
    const parsed = parsePropertySearch(searchQuery);
    if (!parsed.address && !parsed.ain) {
      setMessage("Enter a street address or APN number.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const result = await lookupBurbankParcel(parsed.address, {
      ain: parsed.ain,
      zone: project.property.zone,
    });

    setMessage(result.message);

    if (result.success && result.propertyPatch && result.sitePlanPatch) {
      const sitePlan = {
        ...project.sitePlan,
        ...result.sitePlanPatch,
        lookupMessage: result.message,
      };
      const property = { ...project.property, ...result.propertyPatch };
      const mergedProject = { ...project, property, sitePlan };
      const envelope = syncEnvelopeFromSitePlan(
        sitePlan,
        project.envelope,
        getSitePlanSyncOptions(mergedProject)
      );

      onChange({
        ...project,
        property,
        sitePlan,
        envelope,
      });

      setSearchQuery(propertySearchDisplayValue(property));
    }

    setLoading(false);
  }

  const verified = project.property.gisVerified && project.sitePlan.lookupAt;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Property intake</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter a Burbank street address or assessor parcel number (APN). Parcel
          geometry, zoning, and lot metrics load from GIS.
        </p>
      </div>

      <Card className="border-sky-200 bg-sky-50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput
            label="Street address or APN"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="123 N Hollywood Way, Burbank, CA — or 1234-567-890"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runLookup();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={runLookup}
            disabled={loading || !searchQuery.trim()}
            className="inline-flex shrink-0 items-center gap-2 sm:mb-0.5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            Look up parcel
          </Button>
        </div>

        {message && (
          <p
            className={`mt-3 text-xs ${
              message.includes("loaded") || message.includes("Parcel")
                ? "text-emerald-800"
                : "text-amber-800"
            }`}
          >
            {message}
          </p>
        )}
        {project.sitePlan.lookupAt && (
          <p className="mt-1 font-mono text-[10px] text-sky-600">
            Last lookup: {new Date(project.sitePlan.lookupAt).toLocaleString()}
            {project.sitePlan.lookupSource === "lacounty_assessor" &&
              " · LA County Assessor"}
          </p>
        )}
      </Card>

      {verified && (
        <Card className="flex flex-wrap items-center gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-emerald-900">
              {project.property.address}
            </p>
            <p className="text-xs text-emerald-800">
              {project.property.apn && <>APN {project.property.apn} · </>}
              Zone {project.property.zone}
              {project.property.lotSqFt &&
                ` · ${project.property.lotSqFt.toLocaleString()} sq ft`}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
