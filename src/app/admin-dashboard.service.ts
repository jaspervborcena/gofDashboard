import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, getDoc, getDocs } from '@angular/fire/firestore';

export interface AdminUserRecord {
  id: string;
  uid?: string;
  email?: string;
  fullName?: string;
  displayName?: string;
  nickname?: string;
  role?: string;
  plan?: string;
  createdAt?: unknown;
  lastActiveAt?: unknown;
}

export interface AdminGameRecord {
  id: string;
  gameId?: string;
  gameUid?: string;
  name?: string;
  creatorId?: string;
  createdAt?: unknown;
  startAt?: unknown;
  closeAt?: unknown;
  closedAt?: unknown;
}

export interface AdminParticipantRecord {
  id: string;
  gameUid?: string;
  gameId?: string;
  status?: string;
  joinedAt?: unknown;
}

export interface AdminWinnerRecord {
  id: string;
  gameUid?: string;
  gameId?: string;
  wonAt?: unknown;
}

export interface AdminSubscriptionRecord {
  id: string;
  uid?: string;
  planType?: string;
  status?: string;
  endDate?: unknown;
}

export interface AdminDashboardData {
  users: AdminUserRecord[];
  games: AdminGameRecord[];
  participants: AdminParticipantRecord[];
  winners: AdminWinnerRecord[];
  subscriptions: AdminSubscriptionRecord[];
}

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly firestore = inject(Firestore);

  async isAdmin(userId: string): Promise<boolean> {
    const adminRecord = await getDoc(doc(this.firestore, 'admins', userId));
    return adminRecord.data()?.['enabled'] === true;
  }

  async loadData(): Promise<AdminDashboardData> {
    const [usersSnapshot, gamesSnapshot, participantsSnapshot, winnersSnapshot, subscriptionsSnapshot] = await Promise.all([
      getDocs(collection(this.firestore, 'users')),
      getDocs(collection(this.firestore, 'games')),
      getDocs(collection(this.firestore, 'participants')),
      getDocs(collection(this.firestore, 'winners')),
      getDocs(collection(this.firestore, 'subscriptions'))
    ]);

    return {
      users: usersSnapshot.docs.map((record) => ({ ...record.data(), id: record.id } as AdminUserRecord)),
      games: gamesSnapshot.docs.map((record) => ({ ...record.data(), id: record.id } as AdminGameRecord)),
      participants: participantsSnapshot.docs.map((record) => ({ ...record.data(), id: record.id } as AdminParticipantRecord)),
      winners: winnersSnapshot.docs.map((record) => ({ ...record.data(), id: record.id } as AdminWinnerRecord)),
      subscriptions: subscriptionsSnapshot.docs.map((record) => ({ ...record.data(), id: record.id } as AdminSubscriptionRecord))
    };
  }
}