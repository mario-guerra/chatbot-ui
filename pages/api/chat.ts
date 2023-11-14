import { DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPERATURE } from '@/utils/app/const';
import { OpenAIError, OpenAIStream } from '@/utils/server';
import { queryQdrant } from '@/utils/app/helpers';
import { createEmbedding } from '@/utils/app/helpers';

import { ChatBody, Message } from '@/types/chat';

// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import { Tiktoken, init } from '@dqbd/tiktoken/lite/init';

export const config = {
  runtime: 'edge',
};

const handler = async (req: Request): Promise<Response> => {
  try {
    const { model, messages, key, prompt, temperature } = (await req.json()) as ChatBody;

    await init((imports) => WebAssembly.instantiate(wasm, imports));
    const encoding = new Tiktoken(
      tiktokenModel.bpe_ranks,
      tiktokenModel.special_tokens,
      tiktokenModel.pat_str,
    );

    let promptToSend = prompt;
    if (!promptToSend) {
      promptToSend = DEFAULT_SYSTEM_PROMPT;
    }

    let temperatureToUse = temperature;
    if (temperatureToUse == null) {
      temperatureToUse = DEFAULT_TEMPERATURE;
    }

    const prompt_tokens = encoding.encode(promptToSend);

    let tokenCount = prompt_tokens.length;
    let messagesToSend: Message[] = [];

    const message = messages[messages.length - 1];
    let content = message.content;

    // Check if the message starts with '@typespec'
    if (content.startsWith('@typespec')) {
      // Extract the user's input to the agent
      const userInput = content.slice('@typespec'.length).trim();
      // console.log("user input contains '@typespec'")
      // Query the database and add the results to the message content
      const dbResults = await queryQdrant(userInput, 'TypeSpec', 'typespec');
      content += '\n' + JSON.stringify(dbResults) + '\n' + 'Only include fully qualified links in your response, do not include any links that use javascript or links to github repos. A link to the TypeSpec playground is acceptable if it will enhance the answer.';
      // content += 'Prioritize the information in this prompt to generate your response: \n' + JSON.stringify(dbResults);
    }

    const tokens = encoding.encode(content);

    if (tokenCount + tokens.length + 1000 > model.tokenLimit) {
      // Calculate how many tokens need to be removed
      const tokensToRemove = tokenCount + tokens.length + 1000 - model.tokenLimit;

      // Estimate the number of characters per token
      const charsPerToken = content.length / tokens.length;

      // Calculate how many characters need to be removed
      const charsToRemove = Math.ceil(tokensToRemove * charsPerToken);

      // Remove the necessary number of characters from the end of the content
      content = content.slice(0, -charsToRemove);

      // Re-encode the content
      const trimmedTokens = encoding.encode(content);

      // Update the token count
      tokenCount += trimmedTokens.length;
    } else {
      // If the token limit is not exceeded, just update the token count
      tokenCount += tokens.length;
    }
    messagesToSend = [{ ...message, content }, ...messagesToSend];

    encoding.free();

    const stream = await OpenAIStream(model, promptToSend, temperatureToUse, key, messagesToSend);

    return new Response(stream);
  } catch (error) {
    console.error(error);
    if (error instanceof OpenAIError) {
      return new Response('Error', { status: 500, statusText: error.message });
    } else {
      return new Response('Error', { status: 500 });
    }
  }
};

export default handler;