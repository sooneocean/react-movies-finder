// Fetch TMDB at request time, not during credential-free WatchPilot builds.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { HeroSlider } from "@/components/media/hero-slider";
import { MediaCard } from "@/components/media/media-card";
import { MediaCarousel } from "@/components/media/media-carousel";
import { Movie } from "@/types/movies";
import { TVShow } from "@/types/tv";
import { getHomePageData } from "./actions";

function isMovie(item: Movie | TVShow): item is Movie {
  return "title" in item;
}

function toHeroSlide(item: Movie | TVShow) {
  const isMovieItem = isMovie(item);
  return {
    id: item.id,
    title: isMovieItem ? item.title : item.name,
    overview: item.overview,
    backdropPath: item.backdrop_path,
    rating: item.vote_average,
    year: isMovieItem ? item.release_date : item.first_air_date,
    mediaType: (isMovieItem ? "movie" : "tv") as "movie" | "tv",
  };
}

function renderCarouselItems(items: (Movie | TVShow)[]) {
  return items.slice(0, 20).map((item, i) => {
    const isMovieItem = isMovie(item);
    return (
      <div key={item.id} className="w-[160px] shrink-0 sm:w-[185px]">
        <MediaCard
          id={item.id}
          title={isMovieItem ? item.title : item.name}
          posterPath={item.poster_path}
          rating={item.vote_average}
          year={
            isMovieItem ? item.release_date : (item as TVShow).first_air_date
          }
          mediaType={isMovieItem ? "movie" : "tv"}
          index={i}
        />
      </div>
    );
  });
}

export default async function Home() {
  const tmdbKey = process.env.MOVIE_DB_API_KEY;
  if (!tmdbKey || tmdbKey === "your_tmdb_api_key_here") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-4 py-12 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">WatchPilot Lab / Local Research</p>
        <h1 className="text-3xl font-bold sm:text-4xl">台灣OTT觀影決策研究</h1>
        <p className="max-w-2xl text-muted-foreground">
          尚未設定TMDB API Key。你仍可直接使用免費的合成片庫研究、7天觀影排程、
          片庫變動演練及規則式決策比較，無須第三方金鑰。
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/lab" className="rounded-lg bg-amber px-5 py-3 font-semibold text-black">
            進入觀影實驗室
          </Link>
          <Link href="/lab/compare" className="rounded-lg border border-amber/40 px-5 py-3 font-medium text-amber">
            免費A/B決策比較
          </Link>
          <Link href="/lab/radar" className="rounded-lg border border-border px-5 py-3 font-medium">
            片庫雷達離線演練
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          若要使用原始Screenbox電影搜尋與台灣片源研究，請在本機.env.local設定自己的MOVIE_DB_API_KEY並重新啟動服務。
          本網站不提供影片播放或未經確認的版權到期資訊。
        </p>
      </main>
    );
  }
  const {
    trendingDay,
    trendingWeek,
    popularMovies,
    popularTV,
    upcoming,
    genres,
  } = await getHomePageData();

  const heroSlides = trendingDay.slice(0, 5).map(toHeroSlide);

  return (
    <main className="flex flex-1 flex-col">
      <HeroSlider slides={heroSlides} />

      <div className="space-y-8 py-8">
        {/* Genre pills */}
        <div
          className="flex gap-2 overflow-x-auto px-4 sm:px-8"
          style={{ scrollbarWidth: "none" }}
        >
          {genres.map((genre) => (
            <a
              key={genre.id}
              href={`/genres/${genre.id}?name=${encodeURIComponent(genre.name)}`}
              className="glass shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
            >
              {genre.name}
            </a>
          ))}
        </div>

        <MediaCarousel title="Trending Today">
          {renderCarouselItems(trendingDay)}
        </MediaCarousel>

        <MediaCarousel title="Trending This Week">
          {renderCarouselItems(trendingWeek)}
        </MediaCarousel>

        <MediaCarousel title="Popular Movies" viewAllHref="/movies">
          {popularMovies.slice(0, 20).map((movie, i) => (
            <div key={movie.id} className="w-[160px] shrink-0 sm:w-[185px]">
              <MediaCard
                id={movie.id}
                title={movie.title}
                posterPath={movie.poster_path}
                rating={movie.vote_average}
                year={movie.release_date}
                mediaType="movie"
                index={i}
              />
            </div>
          ))}
        </MediaCarousel>

        <MediaCarousel title="Popular TV Shows" viewAllHref="/tv">
          {popularTV.slice(0, 20).map((show, i) => (
            <div key={show.id} className="w-[160px] shrink-0 sm:w-[185px]">
              <MediaCard
                id={show.id}
                title={show.name}
                posterPath={show.poster_path}
                rating={show.vote_average}
                year={show.first_air_date}
                mediaType="tv"
                index={i}
              />
            </div>
          ))}
        </MediaCarousel>

        <MediaCarousel title="Upcoming" viewAllHref="/upcoming">
          {upcoming.slice(0, 20).map((movie, i) => (
            <div key={movie.id} className="w-[160px] shrink-0 sm:w-[185px]">
              <MediaCard
                id={movie.id}
                title={movie.title}
                posterPath={movie.poster_path}
                rating={movie.vote_average}
                year={movie.release_date}
                mediaType="movie"
                index={i}
              />
            </div>
          ))}
        </MediaCarousel>
      </div>
    </main>
  );
}
