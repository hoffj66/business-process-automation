import { ChainValues } from "langchain/schema"
import { CogSearchRetriever } from "../retrievers/cogsearch"
import { OpenAIBaseInput } from "langchain/dist/types/openai-types"
import { LLMChain } from "langchain/chains";
import { BufferWindowMemory } from "langchain/memory";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { BaseRetriever } from "langchain/dist/schema/retriever";
import { PromptTemplate } from "langchain";
import axios, { AxiosRequestConfig } from "axios";
import { Document } from "langchain/document";

const mapKey = process.env.MAPS_API_KEY

export class HotelsByGeo {
    private _parameters: any
    constructor(parameters: any) {
        this._parameters = parameters
    }

    private getPrompt = (prompt) => {
        return (prompt && prompt.length > 0) ? PromptTemplate.fromTemplate(prompt) : null
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

    private _getText = (searchables, data) => {
        try {
            if (!searchables || searchables.length === 0) {
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

    public run = async (query: string, memory: BufferWindowMemory): Promise<ChainValues> => {

        //const retriever: BaseRetriever = new CogSearchRetriever(this._parameters.retriever)
        const llmConfig: OpenAIBaseInput = this._parameters.llmConfig
        const llm = new ChatOpenAI(llmConfig)
        const customPrompt = "Return the location that is being discussed.  \nExample: \nQuery: I'd like to find some hotels near Austin, TX.  Result: Austin, TX\nQuery: {question}\n Result:"
        const queryChain = new LLMChain({ prompt: this.getPrompt(customPrompt), llm: llm })
        const targetLocation = await queryChain.call({ question: query })
        console.log(JSON.stringify(targetLocation))
        const maps = await axios.get(`https://atlas.microsoft.com/search/address/json?&subscription-key=${mapKey}&api-version=1.0&language=en-US&query=${targetLocation.text}&countryset=US`)
        let results = "Here are the results of your search: \n"
        const docs = []
        if (maps.data.results.length > 0 && maps.data.results[0]?.position) {
            const geo = maps.data.results[0].position
            if (geo.lat) {
                const filter = `geo.distance(position/geometry, geography'POINT(${geo.lon} ${geo.lat})') le 200`
                const searchResults = await this._search("", filter, 5, this._parameters.retriever.indexConfig)
                const docs: Document<Record<string, any>>[] = []
                for (const v of searchResults) {
                    const doc: Document<Record<string, any>> = {
                        pageContent: this._getText(this._parameters.retriever.indexConfig.searchableFields, v),
                        metadata: v
                    }
                    docs.push(doc)
                }
                console.log(searchResults)
                for (const r of searchResults) {
                    results += `Name: ${r.profile.name}  State: ${r.address.state.name}  Zip: ${r.address.zip} \n`
                }
            }
        }

        return { text: results, sourceDocuments: docs, chatHistory: memory }
    }
}