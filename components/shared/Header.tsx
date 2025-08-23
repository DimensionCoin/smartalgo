"use client";
import { useEffect, useCallback } from "react";
import { SignedIn, SignOutButton, useUser } from "@clerk/nextjs";
import { CiLogout } from "react-icons/ci";
import {
  Bell,
  UserIcon,
  Settings,
  CreditCard,
  User,
  Shield,
  ChevronDown,
  LayoutDashboard,
  TrendingUp,
} from "lucide-react";
import { Button } from "../ui/button";
import { getUser } from "@/actions/user.actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditsProgressBar } from "./CreditsProgressBar";
import { useUserContext } from "@/providers/UserProviderClient";
import LoadingScreen from "./LoadingScreen";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const Header = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const { tier, isContextLoaded } = useUserContext();

  // still used to refresh DB user on mount
  const fetchUserData = useCallback(async (userId: string) => {
    try {
      await getUser(userId);
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && user) {
      fetchUserData(user.id);
    }
  }, [isLoaded, user, fetchUserData]);

  if (!isLoaded || !isContextLoaded) {
    return <LoadingScreen />;
  }

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Playground", href: "/playground", icon: TrendingUp },
    { name: "Bots", href: "/bots", icon: TrendingUp },
  ];

  const editPaymentDetails = async () => {
    const url = process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL!;
    if (url) {
      router.push(
        url + "?prefilled_email=" + user?.emailAddresses[0]?.emailAddress
      );
    } else {
      throw new Error("Failed to edit payment details");
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 flex justify-between items-center w-full py-2 px-4 md:px-6">
        {/* Glassmorphism background */}
        <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-xl shadow-[0_4px_15px_rgba(0,0,0,0.3)] md:shadow-[0_4px_15px_-8px_rgba(0,0,0,0.3),_4px_0_15px_-8px_rgba(0,0,0,0.3)]"></div>

        {/* Decorative gradient haze */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-teal-500/5 via-transparent to-indigo-500/5"></div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-400/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex justify-between items-center w-full">
          {/* Left: Brand + Global Nav dropdown (works on ALL sizes) */}
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative group focus:outline-none flex items-center gap-2 md:gap-3">
                  <div className="absolute -inset-2 rounded-xl bg-gradient-to-r from-teal-400/20 to-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
                  <h2 className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-violet-500 tracking-wide">
                    SmartAlgo
                  </h2>
                  <ChevronDown className="h-4 w-4 text-teal-400 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="start"
                className="w-64 bg-zinc-900/90 backdrop-blur-md border-zinc-800/50 text-zinc-300 shadow-[0_0_20px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden"
              >
                <DropdownMenuLabel className="px-3 py-2 text-sm font-medium border-b border-zinc-800/50">
                  Navigate
                </DropdownMenuLabel>

                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <DropdownMenuItem
                      key={item.href}
                      asChild
                      className={`cursor-pointer rounded-lg px-2 py-2 ${
                        isActive
                          ? "bg-zinc-800/60 text-white"
                          : "hover:bg-zinc-800/50"
                      }`}
                    >
                      <Link
                        href={item.href}
                        className="flex items-center gap-2"
                      >
                        <item.icon
                          className={`h-4 w-4 ${
                            isActive ? "text-teal-400" : "text-zinc-400"
                          }`}
                        />
                        <span>{item.name}</span>
                        {isActive && (
                          <span className="ml-auto w-1.5 h-4 rounded-full bg-gradient-to-b from-teal-400 to-cyan-400" />
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}

                <DropdownMenuSeparator className="bg-zinc-800/50" />
                <div className="px-3 py-2">
                  <CreditsProgressBar />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right: User controls */}
          <div className="flex items-center gap-3 md:gap-6">
            <SignedIn>
              {user && (
                <div className="flex gap-3 md:gap-6 items-center">
                  {tier === "basic" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative group hover:bg-black"
                    >
                      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-teal-400/20 to-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
                      <div className="relative">
                        <Bell className="h-5 w-5 text-zinc-300 hover:text-black" />
                        <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_5px_rgba(45,212,191,0.7)]" />
                      </div>
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="flex items-center gap-2 px-3 hover:bg-zinc-800/50 group border border-white/10"
                      >
                        <div className="relative">
                          <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-teal-400/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
                          <UserIcon className="h-5 w-5 text-zinc-300 relative" />
                        </div>
                        <span className="text-zinc-300">{user.firstName}</span>
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="end"
                      className="w-56 bg-zinc-900/90 backdrop-blur-md border-zinc-800/50 text-zinc-300 shadow-[0_0_20px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden"
                    >
                      <div className="px-3 py-2 text-sm font-medium border-b border-zinc-800/50">
                        <p className="text-zinc-400">Signed in as</p>
                        <p className="truncate text-teal-400">
                          {user.emailAddresses[0]?.emailAddress}
                        </p>
                      </div>

                      <div className="p-1">
                        <DropdownMenuItem
                          asChild
                          className="cursor-pointer hover:bg-zinc-800/50 focus:bg-zinc-800/50 rounded-lg px-2 py-1.5"
                        >
                          <Link
                            href="/account"
                            className="flex items-center gap-2"
                          >
                            <User className="h-4 w-4" />
                            <span>Account</span>
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          asChild
                          className="cursor-pointer hover:bg-zinc-800/50 focus:bg-zinc-800/50 rounded-lg px-2 py-1.5"
                        >
                          <Link
                            href="/settings"
                            className="flex items-center gap-2"
                          >
                            <Settings className="h-4 w-4" />
                            <span>Settings</span>
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className="cursor-pointer hover:bg-zinc-800/50 focus:bg-zinc-800/50 rounded-lg px-2 py-1.5"
                          onClick={editPaymentDetails}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          <span>Billing</span>
                        </DropdownMenuItem>

                        {user.emailAddresses[0]?.emailAddress ===
                          ADMIN_EMAIL && (
                          <DropdownMenuItem
                            asChild
                            className="cursor-pointer hover:bg-zinc-800/50 focus:bg-zinc-800/50 rounded-lg px-2 py-1.5 text-teal-400"
                          >
                            <Link
                              href="/admin"
                              className="flex items-center gap-2"
                            >
                              <Shield className="h-4 w-4" />
                              <span>Admin Dashboard</span>
                            </Link>
                          </DropdownMenuItem>
                        )}
                      </div>

                      <DropdownMenuSeparator className="bg-zinc-800/50" />
                      <div className="p-1">
                        <SignOutButton>
                          <DropdownMenuItem className="cursor-pointer text-red-500 hover:bg-zinc-800/50 focus:bg-zinc-800/50 hover:text-red-400 focus:text-red-400 rounded-lg px-2 py-1.5">
                            <CiLogout className="h-4 w-4 mr-2" />
                            <span>Sign out</span>
                          </DropdownMenuItem>
                        </SignOutButton>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Spacer to push content below fixed header */}
      <div className="h-[72px]" />
    </>
  );
};

export default Header;
