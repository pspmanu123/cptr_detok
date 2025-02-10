import StyleDictionary from "style-dictionary"
import { register } from "@tokens-studio/sd-transforms"
import fs from "node:fs"
import prettier from "prettier"

const brands = JSON.parse(
  fs.readFileSync("src/design-tokens/tokens/$metadata.json", "utf-8")
)
  ?.tokenSetOrder.map((brand) => brand.split("/")[1])
  .filter((v, i, a) => a.indexOf(v) === i)

const modes = ["lightTheme", "darkTheme"]

register(StyleDictionary)

StyleDictionary.registerFormat({
  name: "custom",
  format: ({ dictionary }) => {
    const tokenObj = dictionary.allTokens.reduce(
      (acc, token) => ({
        ...acc,
        [token["$type"]]: acc[token["$type"]]
          ? {
              ...acc[token["$type"]],
              [token.name]: token["$value"],
            }
          : { [token.name]: token["$value"] },
      }),
      {}
    )
    return JSON.stringify(tokenObj, null, 2)
  },
})

function transformTokens(brand, mode) {
  return {
    source: [`src/design-tokens/tokens/${mode}/${brand}.json`],
    platforms: {
      js: {
        transformGroup: "tokens-studio",
        files: [
          {
            destination: `src/design-tokens/theme/${mode}/${brand.toLowerCase()}.json`,
            format: "custom",
          },
        ],
      },
    },
  }
}

async function buildTokensForBrand(brand) {
  for (const mode of modes) {
    const sd = new StyleDictionary(transformTokens(brand, mode))
    await sd.buildAllPlatforms()
  }
}

async function generateVariables(brand, modes) {
  const themeData = {}

  for (const mode of modes) {
    themeData[mode] = JSON.parse(
      await fs.promises.readFile(
        `src/design-tokens/theme/${mode}/${brand.toLowerCase()}.json`,
        "utf-8"
      )
    )
  }

  const [lightTheme, darkTheme] = [themeData.lightTheme, themeData.darkTheme]

  const mergeThemes = (lightTokens, darkTokens) => {
    const result = {}

    const tokenTypes = new Set([
      ...Object.keys(lightTokens),
      ...Object.keys(darkTokens),
    ])

    tokenTypes.forEach((tokenType) => {
      result[tokenType] = {}

      const lightTokenType = lightTokens[tokenType] || {}
      const darkTokenType = darkTokens[tokenType] || {}

      const tokenNames = new Set([
        ...Object.keys(lightTokenType),
        ...Object.keys(darkTokenType),
      ])

      tokenNames.forEach((tokenName) => {
        const lightValue = lightTokenType[tokenName] || darkTokenType[tokenName]
        const darkValue = darkTokenType[tokenName] || lightTokenType[tokenName]

        if (lightValue === darkValue) {
          result[tokenType][tokenName] = lightValue
        } else {
          result[tokenType][tokenName] = {
            light: lightValue,
            dark: darkValue,
          }
        }
      })
    })

    return result
  }

  const themes = mergeThemes(lightTheme, darkTheme)

  const themeFormatter = (obj) => {
    const fileContent = `
      /**
       * Do not edit directly, this file was auto-generated.
       */

      export default ${JSON.stringify(obj, null, 2)}
    `

    return prettier.format(fileContent, {
      parser: "babel",
      semi: false,
      singleQuote: false,
      trailingComma: "es5",
      printWidth: 80,
      tabWidth: 2,
    })
  }

  await fs.promises.writeFile(
    `src/design-tokens/theme/${brand.toLowerCase()}.js`,
    themeFormatter(themes)
  )
}

async function run() {
  for (const brand of brands) {
    await buildTokensForBrand(brand)
  }

  for (const brand of brands) {
    await generateVariables(brand, modes)
  }

  try {
    await fs.promises.rm("src/design-tokens/theme/lightTheme/", {
      recursive: true,
      force: true,
    })
  } catch (error) {
    console.error("Error cleaning up lightTheme directory:", error)
  }

  try {
    await fs.promises.rm("src/design-tokens/theme/darkTheme/", {
      recursive: true,
      force: true,
    })
  } catch (error) {
    console.error("Error cleaning up darkTheme directory:", error)
  }
}

run().catch((error) => {
  console.error("Error during processing:", error)
})
