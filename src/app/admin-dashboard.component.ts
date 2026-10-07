import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AdminDashboardData, AdminDashboardService, AdminGameRecord, AdminParticipantRecord, AdminUserRecord } from './admin-dashboard.service';
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
  selectedOverviewGameIds = new Set<string>();
  showDeleteGamesConfirmation = false;
  deletingGames = false;
  deleteGamesErrorMessage = '';

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

  get currentView(): 'overview' | 'games' | 'users' | 'participants' {
    if (this.router.url.startsWith('/admin/games')) {
      return 'games';
    }
    if (this.router.url.startsWith('/admin/users')) {
      return 'users';
    }
    if (this.router.url.startsWith('/admin/participants')) {
      return 'participants';
    }
    return 'overview';
  }

  get pageTitle(): string {
    if (this.currentView === 'games') return 'Active games';
    if (this.currentView === 'users') return 'Users';
    if (this.currentView === 'participants') return 'Participants';
    return 'Overview';
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

  participantSearch = '';
  participantGameFilter = '';
  participantHostFilter = '';
  participantFromDate = '';
  participantToDate = '';
  participantPage = 1;
  selectedParticipantIds = new Set<string>();
  showDeleteConfirmation = false;
  deletingParticipants = false;
  deleteErrorMessage = '';

  get participantGames(): AdminGameRecord[] {
    return [...(this.data?.games ?? [])]
      .sort((left, right) => this.dateTime(right.createdAt) - this.dateTime(left.createdAt));
  }

  get participantHosts(): string[] {
    return [...new Set(this.participantGames.map((game) => game.creatorId).filter((id): id is string => !!id))]
      .sort((left, right) => this.hostName(left).localeCompare(this.hostName(right)));
  }

  get filteredParticipants(): AdminParticipantRecord[] {
    const search = this.participantSearch.trim().toLocaleLowerCase();
    const from = this.participantFromDate ? new Date(`${this.participantFromDate}T00:00:00`).getTime() : null;
    const to = this.participantToDate ? new Date(`${this.participantToDate}T23:59:59.999`).getTime() : null;

    return [...(this.data?.participants ?? [])]
      .filter((participant) => {
        const game = this.gameForParticipant(participant);
        const joinedAt = this.dateTime(participant.joinedAt);
        const hostId = game?.creatorId ?? '';
        if (this.participantGameFilter && (game?.gameUid || game?.id) !== this.participantGameFilter) return false;
        if (this.participantHostFilter && hostId !== this.participantHostFilter) return false;
        if (participant.status === 'removed') return false;
        if (from !== null && (!joinedAt || joinedAt < from)) return false;
        if (to !== null && (!joinedAt || joinedAt > to)) return false;
        if (!search) return true;

        const searchable = [
          participant.name,
          participant.ticketCode,
          participant.mobileNumber,
          game?.name,
          this.hostName(hostId),
          this.userFor(participant.userId)?.email
        ].join(' ').toLocaleLowerCase();
        return searchable.includes(search);
      })
      .sort((left, right) => this.dateTime(right.joinedAt) - this.dateTime(left.joinedAt));
  }

  get participantRows(): AdminParticipantRecord[] {
    const start = (this.participantPage - 1) * this.pageSize;
    return this.filteredParticipants.slice(start, start + this.pageSize);
  }

  get participantPageCount(): number {
    return Math.max(1, Math.ceil(this.filteredParticipants.length / this.pageSize));
  }

  get participantRangeStart(): number {
    return this.filteredParticipants.length ? (this.participantPage - 1) * this.pageSize + 1 : 0;
  }

  get participantRangeEnd(): number {
    return Math.min(this.participantPage * this.pageSize, this.filteredParticipants.length);
  }

  get allFilteredParticipantsSelected(): boolean {
    return this.filteredParticipants.length > 0
      && this.filteredParticipants.every((participant) => this.selectedParticipantIds.has(participant.id));
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

  get allOverviewGamesSelected(): boolean {
    return this.overviewGames.length > 0
      && this.overviewGames.every((game) => this.selectedOverviewGameIds.has(game.gameUid || game.id));
  }

  setOverviewGameSelected(gameId: string, selected: boolean): void {
    if (selected) {
      this.selectedOverviewGameIds.add(gameId);
    } else {
      this.selectedOverviewGameIds.delete(gameId);
    }
  }

  toggleAllOverviewGames(selected: boolean): void {
    this.selectedOverviewGameIds.clear();
    if (selected) {
      this.overviewGames.forEach((game) => this.selectedOverviewGameIds.add(game.gameUid || game.id));
    }
  }

  async deleteSelectedOverviewGames(): Promise<void> {
    if (!this.selectedOverviewGameIds.size || this.deletingGames || !this.data) return;
    this.deletingGames = true;
    this.deleteGamesErrorMessage = '';
    const selectedIds = new Set(this.selectedOverviewGameIds);
    const selectedGames = this.data.games.filter((game) => selectedIds.has(game.gameUid || game.id));
    const selectedGameIds = new Set(selectedGames.flatMap((game) => [game.gameUid || game.id, game.gameId || game.id]));

    try {
      await this.adminDataService.deleteGames(selectedGames);
      this.data = {
        ...this.data,
        games: this.data.games.filter((game) => !selectedIds.has(game.gameUid || game.id)),
        participants: this.data.participants.filter((participant) =>
          !selectedGameIds.has(participant.gameUid || participant.gameId || '')
        ),
        winners: this.data.winners.filter((winner) =>
          !selectedGameIds.has(winner.gameUid || winner.gameId || '')
        )
      };
      this.selectedOverviewGameIds.clear();
      this.showDeleteGamesConfirmation = false;
      this.gamePage = Math.min(this.gamePage, this.gamePageCount);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      this.deleteGamesErrorMessage = code
        ? `Selected games could not be deleted (${code}). Check the deployed admin deletion rules and try again.`
        : 'Selected games could not be deleted. Check your admin permissions and try again.';
    } finally {
      this.deletingGames = false;
    }
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

  hostName(hostId?: string): string {
    const host = this.userFor(hostId);
    return host?.fullName?.trim() || host?.displayName?.trim() || host?.nickname?.trim() || host?.email || 'Host not found';
  }

  participantGameName(participant: AdminParticipantRecord): string {
    return this.gameForParticipant(participant)?.name || 'Game not found';
  }

  participantHostName(participant: AdminParticipantRecord): string {
    return this.hostName(this.gameForParticipant(participant)?.creatorId);
  }

  participantEmail(participant: AdminParticipantRecord): string {
    return this.userFor(participant.userId)?.email || '';
  }

  participantGameCode(participant: AdminParticipantRecord): string {
    const game = this.gameForParticipant(participant);
    return game?.gameId || game?.id || participant.gameId || '—';
  }

  participantStatus(participant: AdminParticipantRecord): string {
    return participant.status || 'active';
  }

  participantFiltersChanged(): void {
    this.participantPage = 1;
    this.selectedParticipantIds.clear();
    this.deleteErrorMessage = '';
  }

  setParticipantSelected(participantId: string, selected: boolean): void {
    if (selected) {
      this.selectedParticipantIds.add(participantId);
    } else {
      this.selectedParticipantIds.delete(participantId);
    }
  }

  toggleAllFilteredParticipants(selected: boolean): void {
    this.selectedParticipantIds.clear();
    if (selected) {
      this.filteredParticipants.forEach((participant) => this.selectedParticipantIds.add(participant.id));
    }
  }

  isParticipantSelected(participantId: string): boolean {
    return this.selectedParticipantIds.has(participantId);
  }

  previousParticipantsPage(): void {
    this.participantPage = Math.max(1, this.participantPage - 1);
  }

  nextParticipantsPage(): void {
    this.participantPage = Math.min(this.participantPageCount, this.participantPage + 1);
  }

  async deleteSelectedParticipants(): Promise<void> {
    if (!this.selectedParticipantIds.size || this.deletingParticipants) return;
    this.deletingParticipants = true;
    this.deleteErrorMessage = '';
    const selectedIds = new Set(this.selectedParticipantIds);
    try {
      await this.adminDataService.deleteParticipants([...selectedIds]);
      if (this.data) {
        this.data = {
          ...this.data,
          participants: this.data.participants.filter((participant) => !selectedIds.has(participant.id))
        };
      }
      this.selectedParticipantIds.clear();
      this.showDeleteConfirmation = false;
      this.participantPage = Math.min(this.participantPage, this.participantPageCount);
    } catch {
      this.deleteErrorMessage = 'Selected players could not be deleted. Check your admin permissions and try again.';
    } finally {
      this.deletingParticipants = false;
    }
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

  private gameForParticipant(participant: AdminParticipantRecord): AdminGameRecord | undefined {
    return this.data?.games.find((game) =>
      game.id === participant.gameUid
      || game.gameUid === participant.gameUid
      || game.gameId === participant.gameId
      || game.id === participant.gameId
    );
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