# ElasticSearch Module

Global module for ElasticSearch-based repositories.

## Usage

### In Services

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { ELASTICSEARCH_REPOSITORY_TOKENS } from '@infra/elasticsearch';
import { IProductContractRepository } from './repositories/product.contract.repository';

@Injectable()
export class ProductService {
  constructor(
    @Inject(ELASTICSEARCH_REPOSITORY_TOKENS.PRODUCT_REPOSITORY)
    private readonly productRepository: IProductContractRepository,
  ) {}
}
```

### Available Tokens

- `ELASTICSEARCH_REPOSITORY_TOKENS.PRODUCT_REPOSITORY` (when uncommented)
- `ELASTICSEARCH_REPOSITORY_TOKENS.LOG_REPOSITORY` (when uncommented)

### Direct Client Access

```typescript
import { ELASTICSEARCH_TOKEN } from '@infra/elasticsearch';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class CustomService {
  constructor(
    @Inject(ELASTICSEARCH_TOKEN)
    private readonly esClient: Client,
  ) {}
}
```

## Adding New ElasticSearch Repository

1. **Add token** in `tokens/repository-tokens.ts`:
```typescript
export const ELASTICSEARCH_REPOSITORY_TOKENS = {
  // ...
  MY_NEW_REPOSITORY: Symbol('MY_NEW_REPOSITORY'),
} as const;
```

2. **Register in** `elasticsearch.providers.ts`:
```typescript
import { MyNewElasticSearchRepository } from '../../my-module/repositories/my-new.elastic-search.repository';

export const elasticsearchRepositoryProviders: Provider[] = [
  // ...
  MyNewElasticSearchRepository,
  {
    provide: ELASTICSEARCH_REPOSITORY_TOKENS.MY_NEW_REPOSITORY,
    useExisting: MyNewElasticSearchRepository,
  },
];
```

3. **Use it**:
```typescript
@Inject(ELASTICSEARCH_REPOSITORY_TOKENS.MY_NEW_REPOSITORY)
private readonly myRepo: IMyNewContractRepository
```

## Environment Variables

```env
ELASTIC_SEARCH_URL=http://localhost:9200
```

## Structure

```
elasticsearch/
├── elasticsearch.module.ts          # Global module
├── elasticsearch.providers.ts       # ES client + repository providers
├── tokens/
│   ├── elasticsearch-token.ts      # ES client token
│   └── repository-tokens.ts        # Repository tokens
└── index.ts                         # Exports
```

## Notes

- This module is `@Global()` - no need to import in feature modules
- Repositories are currently commented out in `elasticsearch.providers.ts`
- Uncomment them when ready to use

