"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Coins, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { simulateCreditPurchase } from "~/actions/billing";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const packages = [
  { credits: 25, price: "$1.99", name: "Starter" },
  { credits: 100, price: "$5.99", name: "Studio", popular: true },
  { credits: 250, price: "$11.99", name: "Producer" },
];

export default function Upgrade() {
  const [selectedPackage, setSelectedPackage] = useState<
    (typeof packages)[number] | null
  >(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const router = useRouter();

  const handlePurchase = async () => {
    if (!selectedPackage || isPurchasing) return;

    setIsPurchasing(true);
    try {
      await simulateCreditPurchase(selectedPackage.credits);
      toast.success(`${selectedPackage.credits} demo credits added.`);
      setSelectedPackage(null);
      router.refresh();
    } catch (error) {
      console.error("[billing] Demo credit purchase failed", error);
      toast.error("Unable to add demo credits. Please try again.");
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <>
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Credit packages</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose a package to add demo credits to your account.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {packages.map((creditPackage) => (
            <div
              key={creditPackage.credits}
              className={`relative flex flex-col rounded-xl border p-4 ${
                creditPackage.popular
                  ? "border-primary bg-primary/5"
                  : "bg-card"
              }`}
            >
              {creditPackage.popular && (
                <span className="text-primary mb-2 text-xs font-semibold">
                  MOST POPULAR
                </span>
              )}
              <h3 className="font-semibold">{creditPackage.name}</h3>
              <p className="mt-2 text-2xl font-bold">{creditPackage.price}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {creditPackage.credits} credits
              </p>
              <Button
                className="mt-5 w-full"
                variant={creditPackage.popular ? "default" : "outline"}
                onClick={() => setSelectedPackage(creditPackage)}
              >
                <Coins />
                Select package
              </Button>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          Demo only — prices are examples. No real payment is collected.
        </p>
      </div>

      <Dialog
        open={selectedPackage !== null}
        onOpenChange={(open) => {
          if (!open && !isPurchasing) setSelectedPackage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm demo purchase</DialogTitle>
            <DialogDescription>
              {selectedPackage
                ? `Add ${selectedPackage.credits} credits for ${selectedPackage.price}? This is a demo flow; no payment will be processed.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-4">
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-medium">
                {selectedPackage?.credits} demo credits
              </p>
              <p className="text-muted-foreground text-sm">
                {selectedPackage?.price} example price
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isPurchasing}
              onClick={() => setSelectedPackage(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedPackage || isPurchasing}
              onClick={() => void handlePurchase()}
            >
              {isPurchasing ? <Loader2 className="animate-spin" /> : <Check />}
              {isPurchasing ? "Processing..." : "Confirm demo purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
