import {useLocation} from 'preact-iso';

export default function NotFoundPage() {
  const {route} = useLocation();

  return (
    <s-page heading="Page not found">
      <s-section>
        <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
          <s-paragraph>
            The page you're looking for doesn't exist.
          </s-paragraph>
          <s-button onClick={() => route('/')}>Go home</s-button>
        </s-grid>
      </s-section>
    </s-page>
  );
}
