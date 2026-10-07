import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, getDoc, getDocs, query, where, writeBatch } from '@angular/fire/firestore';

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
  userId?: string;
  name?: string;
  assignedNumber?: number;
  ticketCode?: string;
  mobileNumber?: string;
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

  async deleteParticipants(participantIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(participantIds)];
    for (let offset = 0; offset < uniqueIds.length; offset += 450) {
      const batch = writeBatch(this.firestore);
      uniqueIds.slice(offset, offset + 450).forEach((participantId) => {
        batch.delete(doc(this.firestore, 'participants', participantId));
      });
      await batch.commit();
    }
  }

  async deleteGames(games: AdminGameRecord[]): Promise<void> {
    const recordPaths = new Set<string>();
    const relatedCollections = ['participants', 'invitations', 'history', 'winners'] as const;

    for (const game of games) {
      const gameUid = game.gameUid || game.id;
      const gameId = game.gameId || game.id;
      recordPaths.add(`games/${game.id}`);

      const relatedQueries = relatedCollections.flatMap((collectionName) => [
        query(collection(this.firestore, collectionName), where('gameUid', '==', gameUid)),
        ...(gameId !== gameUid
          ? [query(collection(this.firestore, collectionName), where('gameId', '==', gameId))]
          : [])
      ]);
      const snapshots = await Promise.all(relatedQueries.map((relatedQuery) => getDocs(relatedQuery)));
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((record) => recordPaths.add(`${record.ref.parent.id}/${record.id}`));
      });
    }

    const paths = [...recordPaths];
    for (let offset = 0; offset < paths.length; offset += 450) {
      const batch = writeBatch(this.firestore);
      paths.slice(offset, offset + 450).forEach((path) => {
        const [collectionName, documentId] = path.split('/');
        batch.delete(doc(this.firestore, collectionName, documentId));
      });
      await batch.commit();
    }
  }
}