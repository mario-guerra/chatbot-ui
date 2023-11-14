const { OpenAIClient } = require("@azure/openai");
const { AzureKeyCredential } = require("@azure/core-auth");
import { QdrantClient} from '@qdrant/js-client-rest';


const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL
const chatModel = process.env.OPENAI_DEPLOYMENT_ID
const key = process.env.OPENAI_API_KEY
const endpoint = process.env.OPENAI_API_HOST
const client = new OpenAIClient(endpoint, new AzureKeyCredential(key));

const qdrantClient = new QdrantClient({ url: 'http://<qdrant_container_app_name>.<region>.azurecontainer.io:6333/collections' });

export async function queryQdrant(
    userInput: string,
    collectionName: string,
    language: string
): Promise<any> {
	// console.log("about to create embedding...")
    const embedding = await createEmbedding(userInput);
    const vectorEmbedding = embedding;
	// console.log("vector embedding: ", vectorEmbedding)
	// console.log("collection name: ", collectionName)
	// console.log("querying qdrant for user input: ", userInput)
    let searchResults = await qdrantClient.search(collectionName, {
        vector: vectorEmbedding,
        limit: 3,
    });
	// console.log("search results: ", search_results)
	let payload = searchResults.length > 0 ? searchResults[0].payload : null;
    // console.log("search results: ", payload);
    return payload;
}

function extractAndParseJson(input: string): any {
	const jsonRegex = /{[\s\S]*?}/;
	const match = input.match(jsonRegex);

	if (match) {
		try {
			const jsonObject = JSON.parse(match[0]);
			return jsonObject;
		} catch (error) {
			console.error('Error parsing JSON:', error);
		}
	}
	return null;
}


export async function createEmbedding(data: string): Promise<number[]> {
    const MAX_RETRIES = 5;
    let retry_count = 0;

    while (retry_count < MAX_RETRIES) {
        try {
            // const response = await openai.Embedding.create({
            //     engine: 'text-embedding-ada-002',
            //     input: data,
            // });
			// console.log("endpoint: ", endpoint)
			// console.log("embedding model: ", embeddingModel)
			const response = await client.getEmbeddings(embeddingModel, data);
            const embeddings = response.data[0].embedding;
            return embeddings;
        } catch (err) {
			const errorMessage = (err as any).toString();
			if (errorMessage.includes('exceeded call rate limit')) {
				const delayStr = errorMessage.match(/Please retry after (\d+)/);
				if (delayStr) {
					const delay = parseInt(delayStr[1], 10);
					console.log(`Rate limit exceeded. Retrying in ${delay} seconds...`);
					await sleep(delay * 1000);
					retry_count += 1;
				} else {
					throw new Error('Unknown error message when creating embeddings.');
				}
			} else {
				throw err;
			}
        }
    }

    throw new Error('Rate limit error. All retries failed.');
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


