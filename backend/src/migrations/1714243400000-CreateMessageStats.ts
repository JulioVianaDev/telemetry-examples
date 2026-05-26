import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateMessageStats1714243400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'message_stats',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'tenantId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'userName',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'totalMessages',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'pendingCount',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'processedCount',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'collectedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('message_stats');
  }
}
