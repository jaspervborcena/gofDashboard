import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AdminDashboardData, AdminDashboardService, AdminGameRecord, AdminParticipantRecord, AdminSubscriptionRecord, AdminUserRecord } from './admin-dashboard.service';
import { RaffleService } from './raffle.service';

type DashboardPeriod = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminDataService = inject(AdminDashboardService);
  private readonly raffleService = inject(RaffleService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageSize = 20;
  readonly periods: { id: DashboardPeriod; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'thisWeek', label: 'This week' },
    { id: 'lastWeek', label: 'Last week' },
    { id: 'thisMonth', label: 'This month' },
    { id: 'lastMonth', label: 'Last month' }
  ];

  data: AdminDashboardData | null = null;
  adminName = 'Administrator';
  adminEmailAddress = '';
  period: DashboardPeriod = 'thisMonth';
  gamePage = 1;
  userPage = 1;
  loading = true;
  loadingData = false;
  accessDenied = false;
  errorMessage = '';

  ngOnInit(): void {
    this.raffleService.user$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          const returnUrl = this.router.url || '/';
          void this.router.navigate(['/signin'], { queryParams: { returnUrl } });
          return;
        }

        this.adminName = user.displayName || user.email || 'Administrator';
        this.adminEmailAddress = user.email || '';
        void this.loadForUser(user.uid);
      });
  }

  get currentView(): 'overview' | 'games' | 'users' {
    if (this.router.url.startsWith('/admin/games')) {
      return 'games';
    }
    if (this.router.url.startsWith('/admin/users')) {
      return 'users';
    }
    return 'overview';
  }

  get pageTitle(): string {
    return this.currentView === 'games' ? 'Active games' : this.currentView === 'users' ? 'Users' : 'Overview';
  }

  get activeGames(): AdminGameRecord[] {
    return (this.data?.games ?? [])
      .filter((game) => this.isGameActive(game))
      .sort((left, right) => this.dateTime(right.createdAt) - this.dateTime(left.createdAt));
  }

  get sortedUsers(): AdminUserRecord[] {
    return [...(this.data?.users ?? [])]
      .sort((left, right) => this.dateTime(right.createdAt) - this.dateTime(left.createdAt));
  }

  get gameRows(): AdminGameRecord[] {
    const start = (this.gamePage - 1) * this.pageSize;
    return this.activeGames.slice(start, start + this.pageSize);
  }

  get userRows(): AdminUserRecord[] {
    const start = (this.userPage - 1) * this.pageSize;
    return this.sortedUsers.slice(start, start + this.pageSize);
  }

  get gamePageCount(): number {
    return Math.max(1, Math.ceil(this.activeGames.length / this.pageSize));
  }

  get userPageCount(): number {
    return Math.max(1, Math.ceil(this.sortedUsers.length / this.pageSize));
  }

  get gameRangeStart(): number {
    return this.activeGames.length ? (this.gamePage - 1) * this.pageSize + 1 : 0;
  }

  get gameRangeEnd(): number {
    return Math.min(this.gamePage * this.pageSize, this.activeGames.length);
  }

  get userRangeStart(): number {
    return this.sortedUsers.length ? (this.userPage - 1) * this.pageSize + 1 : 0;
  }

  get userRangeEnd(): number {
    return Math.min(this.userPage * this.pageSize, this.sortedUsers.length);
  }

  get periodLabel(): string {
    return this.periods.find((item) => item.id === this.period)?.label ?? 'This month';
  }

  get periodGamesCreated(): number {
    return (this.data?.games ?? []).filter((game) => this.isInSelectedPeriod(game.createdAt)).length;
  }

  get periodUsersCreated(): number {
    return (this.data?.users ?? []).filter((user) => this.isInSelectedPeriod(user.createdAt)).length;
  }

  get periodParticipantCount(): number {
    return (this.data?.participants ?? []).filter((participant) => this.isInSelectedPeriod(participant.joinedAt)).length;
  }

  get periodWinnerCount(): number {
    return (this.data?.winners ?? []).filter((winner) => this.isInSelectedPeriod(winner.wonAt)).length;
  }

  get overviewGames(): AdminGameRecord[] {
    return this.activeGames.slice(0, 6);
  }

  get adminEmail(): string {
    return this.adminEmailAddress;
  }

  setPeriod(period: DashboardPeriod): void {
    this.period = period;
  }

  creatorName(game: AdminGameRecord): string {
    const creator = this.userFor(game.creatorId);
    return creator?.fullName?.trim()
      || creator?.displayName?.trim()
      || creator?.nickname?.trim()
      || 'Name not provided';
  }

  creatorEmail(game: AdminGameRecord): string {
    return this.userFor(game.creatorId)?.email || 'Email not provided';
  }

  gamePlan(game: AdminGameRecord): string {
    return this.planFor(this.userFor(game.creatorId));
  }

  userName(user: AdminUserRecord): string {
    return user.fullName?.trim() || user.displayName?.trim() || user.nickname?.trim() || 'Name not provided';
  }

  userPlan(user: AdminUserRecord): string {
    return this.planFor(user);
  }

  gamesHosted(user: AdminUserRecord): number {
    return (this.data?.games ?? []).filter((game) => game.creatorId === (user.uid || user.id)).length;
  }

  participantsFor(game: AdminGameRecord, inSelectedPeriod = false): number {
    const gameUid = game.gameUid || game.id;
    const gameId = game.gameId || game.id;
    return (this.data?.participants ?? []).filter((participant) =>
      this.belongsToGame(participant, gameUid, gameId)
      && participant.status !== 'removed'
      && (!inSelectedPeriod || this.isInSelectedPeriod(participant.joinedAt))
    ).length;
  }

  winnersFor(game: AdminGameRecord, inSelectedPeriod = false): number {
    const gameUid = game.gameUid || game.id;
    const gameId = game.gameId || game.id;
    return (this.data?.winners ?? []).filter((winner) =>
      this.belongsToGame(winner, gameUid, gameId)
      && (!inSelectedPeriod || this.isInSelectedPeriod(winner.wonAt))
    ).length;
  }

  previousGamesPage(): void {
    this.gamePage = Math.max(1, this.gamePage - 1);
  }

  nextGamesPage(): void {
    this.gamePage = Math.min(this.gamePageCount, this.gamePage + 1);
  }

  previousUsersPage(): void {
    this.userPage = Math.max(1, this.userPage - 1);
  }

  nextUsersPage(): void {
    this.userPage = Math.min(this.userPageCount, this.userPage + 1);
  }

  async refresh(): Promise<void> {
    this.loadingData = true;
    this.errorMessage = '';
    try {
      this.data = await this.adminDataService.loadData();
      this.gamePage = Math.min(this.gamePage, this.gamePageCount);
      this.userPage = Math.min(this.userPage, this.userPageCount);
    } catch {
      this.errorMessage = 'Dashboard data could not be loaded. Check the deployed Firestore rules and try again.';
    } finally {
      this.loadingData = false;
    }
  }

  async signOut(): Promise<void> {
    await this.raffleService.signOut();
    await this.router.navigate(['/signin']);
  }

  private async loadForUser(userId: string): Promise<void> {
    this.loading = true;
    this.accessDenied = false;
    this.errorMessage = '';
    try {
      this.accessDenied = !(await this.adminDataService.isAdmin(userId));
      if (!this.accessDenied) {
        await this.refresh();
      }
    } catch {
      this.errorMessage = 'Administrator access could not be verified. Check your connection and Firestore rules.';
    } finally {
      this.loading = false;
    }
  }

  private userFor(userId?: string): AdminUserRecord | undefined {
    if (!userId) {
      return undefined;
    }
    return this.data?.users.find((user) => user.id === userId || user.uid === userId);
  }

  private planFor(user?: AdminUserRecord): string {
    if (!user) {
      return 'Unknown';
    }
    const subscription = (this.data?.subscriptions ?? [])
      .filter((item) => item.uid === (user.uid || user.id))
      .find((item) => (item.status === 'active' || item.status === 'trial') && this.dateTime(item.endDate) > Date.now());
    const plan = subscription?.planType || user.plan || 'free';
    if (plan === 'freemium' || plan === 'free') {
      return 'Free';
    }
    return plan.charAt(0).toLocaleUpperCase() + plan.slice(1).toLocaleLowerCase();
  }

  private belongsToGame(record: AdminParticipantRecord, gameUid: string, gameId: string): boolean;
  private belongsToGame(record: { gameUid?: string; gameId?: string }, gameUid: string, gameId: string): boolean {
    return record.gameUid === gameUid || record.gameId === gameId;
  }

  private isGameActive(game: AdminGameRecord): boolean {
    const createdAt = this.asDate(game.createdAt) ?? new Date();
    const startAt = this.asDate(game.startAt) ?? createdAt;
    const closeAt = this.asDate(game.closeAt ?? game.closedAt) ?? new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = Date.now();
    return startAt.getTime() <= now && closeAt.getTime() >= now;
  }

  private isInSelectedPeriod(value: unknown): boolean {
    const date = this.asDate(value);
    if (!date) {
      return false;
    }
    const { start, end } = this.periodRange();
    return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
  }

  private periodRange(): { start: Date; end: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    switch (this.period) {
      case 'today':
        return { start: today, end: tomorrow };
      case 'yesterday':
        return { start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1), end: today };
      case 'thisWeek':
        return { start: weekStart, end: tomorrow };
      case 'lastWeek':
        return { start: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7), end: weekStart };
      case 'thisMonth':
        return { start: monthStart, end: nextMonth };
      case 'lastMonth':
        return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: monthStart };
    }
  }

  private dateTime(value: unknown): number {
    return this.asDate(value)?.getTime() ?? 0;
  }

  displayDate(value: unknown): Date | null {
    return this.asDate(value);
  }

  private asDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = Date.parse(String(value ?? ''));
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }
}