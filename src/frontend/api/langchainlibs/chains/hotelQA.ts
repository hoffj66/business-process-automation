import { ChainValues } from "langchain/schema"
import { OpenAIBaseInput } from "langchain/dist/types/openai-types"
import { BufferWindowMemory } from "langchain/memory";
import { ChatOpenAI } from "langchain/chat_models/openai";
import axios, { AxiosRequestConfig } from "axios";
import { LLMChain, PromptTemplate } from "langchain";

export class HotelQAChain {
    private _parameters: any
    constructor(parameters: any) {
        this._parameters = parameters
    }

    private _search = async (search: string, filter: string, numDocs: number, indexConfig: any): Promise<any[]> => {
        try {

            const headers: AxiosRequestConfig = {
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.COGSEARCH_APIKEY
                }
            }
            let body: any = {
                search: search,
                count: true,
                facets: [],
                filter: filter,
                top: numDocs,
                queryLanguage: "en"
            }
            if (indexConfig) {
                let url = `${process.env.COGSEARCH_URL}/indexes/${indexConfig.name}/docs/search?api-version=2021-04-30-Preview`
                const axiosResult = await axios.post(url, body, headers)


                return axiosResult.data.value
            }

        } catch (err) {
            console.log(err)
        }
        return []
    }


    private _getHotelList = async (memory: BufferWindowMemory) => {
        const out = []
        for (const m of await memory.chatHistory.getMessages()) {
            if (m.content.includes("Hotels: \n")) {
                const splitString = m.content.replace('Hotels:', '').replace(/[\r\n\t]/gm, '').split('- Name:')
                for (const s of splitString) {
                    if (s.trim().length > 0) {
                        out.push(s.trim())
                    }
                }
            }
        }
        return out
    }

    private _getText = (searchables, data) => {
        try {
            if (!searchables || searchables.length === 0 || !data) {
                return ""
            }
            let out = ""

            for (const s of searchables) {
                let currentData = data
                for (const i of s.split('/')) {
                    if (Array.isArray(currentData[i])) {
                        currentData = currentData[i][0]
                    } else {
                        currentData = currentData[i]
                    }
                }
                out += currentData
            }
            return out
        } catch (err) {
            console.log(err)
        }

    }

    private getPrompt = (prompt) => {
        return (prompt && prompt.length > 0) ? PromptTemplate.fromTemplate(prompt) : null
    }


    public run = async (query: string, memory: BufferWindowMemory): Promise<ChainValues> => {
        memory.chatHistory.addUserMessage(query)
        const hotelList = await this._getHotelList(memory)

        const docs = []
        for (const hotel of hotelList) {
            const tempDoc = await this._search("", `profile/name eq '${hotel}'`, 1, this._parameters.retriever.indexConfig)
            docs.push(tempDoc[0])
            console.log(tempDoc)
        }
        let answer = ""
        let iter = 0
        for (const doc of docs) {
            const text = this._getText(this._parameters.retriever.indexConfig.searchableFields, doc)
            const llmConfig: OpenAIBaseInput = this._parameters.llmConfig
            const llm = new ChatOpenAI(llmConfig)
            const customPrompt = "Only use data in the document to answer the question below.  \nQuestion : {question}\nDocument : {document}\n\nAnswer : "
            const queryChain = new LLMChain({ prompt: this.getPrompt(customPrompt), llm: llm })
            const chainResults = await queryChain.call({ question: query, document: text })
            console.log(chainResults)
            answer += `\n\t- ${hotelList[iter]} : ${chainResults.text}\n\n`
            iter++
        }

        memory.chatHistory.addAIChatMessage(answer)
        return { text: answer, sourceDocuments: [], memory: memory }
    }
}