import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('message_stats')
export class MessageStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column({ type: 'int' })
  totalMessages: number;

  @Column({ type: 'int' })
  pendingCount: number;

  @Column({ type: 'int' })
  processedCount: number;

  @CreateDateColumn()
  collectedAt: Date;
}
