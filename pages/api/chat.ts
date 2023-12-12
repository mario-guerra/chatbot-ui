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

    for (let i = 0; i < messages.length; i++) {
      let message = messages[i];
      let content = message.content;
      if (content.includes('@typespec')) {
        const userInput = content.replace('@typespec', '').trim();
        message.content = userInput + ' ' + "azure core"
        console.log('User input: ', userInput)
        const dbResults = await queryQdrant(userInput, 'TypeSpec', 'typespec');
        content = userInput + '\n' + JSON.stringify(dbResults) + '\n' + 'You are an expert in TypeSpec, a specialized language designed by MicroSoft for describing cloud service APIs. Do not confuse TypeSpec with TypeScript, they are two entirely different languages for different purposes. Any request to define a REST API should use the Azure Core library. Assume a data plane REST API unless an ARM REST API is requested. Provide code samples when possible. Code samples should show all imports required. Only include fully qualified links in your response. A link to the TypeSpec playground is acceptable if it will enhance the answer.';
      }
      const tokens = encoding.encode(content);

      if (tokenCount + tokens.length + 1000 > model.tokenLimit) {
        const tokensToRemove = tokenCount + tokens.length + 1000 - model.tokenLimit;
        const charsPerToken = content.length / tokens.length;
        const charsToRemove = Math.ceil(tokensToRemove * charsPerToken);
        content = content.slice(0, -charsToRemove);
        const trimmedTokens = encoding.encode(content);
        tokenCount += trimmedTokens.length;
      } else {
        tokenCount += tokens.length;
      }
      // console.log("message: ", message)
      // console.log("content: ", content)
      messagesToSend.push({ ...message, content });
    }

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